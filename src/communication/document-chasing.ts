/**
 * 8.2 — Document chasing workflow.
 *
 * Lawyer creates a request for client documents with a deadline. The
 * system follows up automatically: day 3 reminder draft, day 7 second
 * reminder draft, day 14 escalation to lawyer. Every reminder lands
 * in the review queue for lawyer approval.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById } from '../db/repositories/matters.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('DocChasing');

export interface DocumentRequest {
  id: string;
  matter_id: string;
  client_id: string | null;
  client_email: string;
  documents_requested: string;
  deadline_date: string;
  status: 'open' | 'partially_received' | 'completed' | 'cancelled';
  request_email_review_id: string | null;
  reminder_3day_review_id: string | null;
  reminder_7day_review_id: string | null;
  escalated_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface CreateDocumentRequestInput {
  matterId: string;
  clientId?: string;
  clientEmail: string;
  documentsRequested: string;
  deadlineDate: string;
  createdBy: string;
}

export function createDocumentRequest(input: CreateDocumentRequestInput): DocumentRequest {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const db = getDatabase();
  const id = randomUUID();
  const body = wrapWithDisclaimer(`# Document request — ${matter.matter_number}

Dear ${matter.client_name},

I hope you are well. To progress your matter we need the following:

${input.documentsRequested}

Please send these by ${input.deadlineDate}.

Kind regards,

[YOUR NAME]`);
  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'document_chasing',
    outputKind: 'client_email',
    title: `Doc request — ${matter.matter_number}`,
    bodyMarkdown: body,
    metadata: { kind: 'document_request', deadline: input.deadlineDate, to: input.clientEmail },
  });
  db.prepare(
    `INSERT INTO document_requests
       (id, matter_id, client_id, client_email, documents_requested, deadline_date,
        status, request_email_review_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(
    id,
    matter.id,
    input.clientId ?? null,
    input.clientEmail,
    input.documentsRequested,
    input.deadlineDate,
    review.id,
    input.createdBy,
  );
  appendLegalAudit({
    matterId: matter.id,
    actorId: input.createdBy,
    action: 'doc_request.create',
    detail: input.documentsRequested.slice(0, 200),
    refTable: 'document_requests',
    refId: id,
  });
  return getRequest(id) as DocumentRequest;
}

export function getRequest(id: string): DocumentRequest | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM document_requests WHERE id = ?').get(id) as DocumentRequest | undefined) ?? null;
}

export function listMatterRequests(matterId: string, status?: 'open' | 'completed'): DocumentRequest[] {
  const db = getDatabase();
  if (status) {
    return db
      .prepare(`SELECT * FROM document_requests WHERE matter_id = ? AND status = ? ORDER BY deadline_date`)
      .all(matterId, status) as DocumentRequest[];
  }
  return db
    .prepare(`SELECT * FROM document_requests WHERE matter_id = ? ORDER BY deadline_date`)
    .all(matterId) as DocumentRequest[];
}

export function listAllOpenRequests(): DocumentRequest[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM document_requests WHERE status IN ('open', 'partially_received') ORDER BY deadline_date`)
    .all() as DocumentRequest[];
}

export function markCompleted(id: string, acting: string): DocumentRequest {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE document_requests SET status = 'completed', completed_at = ? WHERE id = ?`,
  ).run(now, id);
  const req = getRequest(id);
  appendLegalAudit({
    matterId: req?.matter_id ?? null,
    actorId: acting,
    action: 'doc_request.complete',
    detail: id,
    refTable: 'document_requests',
    refId: id,
  });
  return getRequest(id) as DocumentRequest;
}

function buildReminderBody(matterNumber: string, clientName: string, docs: string, deadline: string, kind: '3day' | '7day' | 'final'): string {
  if (kind === '3day') {
    return wrapWithDisclaimer(`# Friendly reminder — ${matterNumber}

Dear ${clientName},

A friendly reminder that we are still waiting for the following:

${docs}

The original deadline was ${deadline}. Please let me know if there are
any issues gathering these.

Kind regards,
[YOUR NAME]`);
  }
  if (kind === '7day') {
    return wrapWithDisclaimer(`# Second reminder — ${matterNumber}

Dear ${clientName},

Following up again — we have not yet received:

${docs}

The deadline (${deadline}) is now well past. Could you please provide
these as a matter of priority, or let me know what is delaying them?

Kind regards,
[YOUR NAME]`);
  }
  return wrapWithDisclaimer(`# Final reminder — ${matterNumber}

Dear ${clientName},

This is the third and final reminder regarding outstanding documents:

${docs}

If we do not receive these within the next 7 days we may need to pause
work on the matter while we wait, which will affect timing and may
require us to re-bill for any re-work.

Kind regards,
[YOUR NAME]`);
}

/**
 * Run periodically (daily cron). Drafts reminder emails into the
 * review queue based on day since creation, and escalates after 14d.
 */
export function dispatchReminders(): { drafted: number; escalated: number } {
  const requests = listAllOpenRequests();
  const now = Date.now();
  const db = getDatabase();
  let drafted = 0;
  let escalated = 0;
  for (const req of requests) {
    const days = (now - new Date(req.created_at).getTime()) / (24 * 3600 * 1000);
    const matter = getMatterById(req.matter_id);
    if (!matter) continue;

    if (days >= 3 && !req.reminder_3day_review_id) {
      const body = buildReminderBody(matter.matter_number, matter.client_name, req.documents_requested, req.deadline_date, '3day');
      const review = enqueueForReview({
        matterId: matter.id,
        matterNumber: matter.matter_number,
        skillId: 'document_chasing',
        outputKind: 'client_email',
        title: `Reminder (3d) — ${matter.matter_number}`,
        bodyMarkdown: body,
        metadata: { request_id: req.id, kind: 'reminder_3day', to: req.client_email },
      });
      db.prepare(`UPDATE document_requests SET reminder_3day_review_id = ? WHERE id = ?`).run(review.id, req.id);
      drafted += 1;
    } else if (days >= 7 && !req.reminder_7day_review_id) {
      const body = buildReminderBody(matter.matter_number, matter.client_name, req.documents_requested, req.deadline_date, '7day');
      const review = enqueueForReview({
        matterId: matter.id,
        matterNumber: matter.matter_number,
        skillId: 'document_chasing',
        outputKind: 'client_email',
        title: `Reminder (7d) — ${matter.matter_number}`,
        bodyMarkdown: body,
        metadata: { request_id: req.id, kind: 'reminder_7day', to: req.client_email },
      });
      db.prepare(`UPDATE document_requests SET reminder_7day_review_id = ? WHERE id = ?`).run(review.id, req.id);
      drafted += 1;
    } else if (days >= 14 && !req.escalated_at) {
      db.prepare(`UPDATE document_requests SET escalated_at = ? WHERE id = ?`).run(new Date().toISOString(), req.id);
      if (matter.responsible_lawyer_email) {
        sendNotification(
          `[Doc chase] ${matter.matter_number} — ESCALATED ${Math.floor(days)}d outstanding`,
          `<p>Document request for ${matter.matter_number} (${matter.client_name}) is ${Math.floor(days)} days outstanding.</p><p>Requested: ${req.documents_requested}</p>`,
          matter.responsible_lawyer_email,
        ).catch(() => undefined);
      }
      appendLegalAudit({
        matterId: matter.id,
        actorId: 'doc-chasing-system',
        action: 'doc_request.escalated',
        detail: req.id,
        refTable: 'document_requests',
        refId: req.id,
      });
      escalated += 1;
    }
  }
  if (drafted || escalated) logger.info(`doc chasing: ${drafted} drafted, ${escalated} escalated`);
  return { drafted, escalated };
}
