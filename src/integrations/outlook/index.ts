/**
 * 7.4 — Outlook Add-in surface.
 *
 * Manifest + API endpoints that the Outlook add-in calls. Manifest at
 * src/integrations/outlook/manifest.json (kept here next to the
 * runtime). API endpoints expose: file email to matter, create matter
 * from email, view matter details, request AI analysis, create task.
 */

import { createSafeLogger } from '../../governance/index.js';
import { getMatterById, getMatterByNumber, createMatter, nextMatterNumber } from '../../db/repositories/matters.js';
import { storeDocument } from '../../uploads/store.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import { upsertDeadline } from '../../db/repositories/deadlines.js';
import { postMessage } from '../../collaboration/matter-chat.js';

const logger = createSafeLogger('OutlookAddin');

export interface OutlookFileEmailInput {
  matterNumber: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  acting: string;
  attachments?: { filename: string; contentType: string; base64Data: string }[];
}

export interface OutlookFileEmailResult {
  ok: boolean;
  matterId?: string;
  documentIds?: string[];
  error?: string;
}

export function fileEmailToMatter(input: OutlookFileEmailInput): OutlookFileEmailResult {
  const matter = getMatterByNumber(input.matterNumber);
  if (!matter) return { ok: false, error: `matter ${input.matterNumber} not found` };

  // Store the email body as a document on the matter.
  const emailMd = `# Email — ${input.subject}\n\nFrom: ${input.fromAddress}\nTo: ${input.toAddress}\nReceived: ${input.receivedAt}\n\n---\n\n${input.bodyText}`;
  const stored = storeDocument({
    matterId: matter.id,
    filename: `email-${Date.now()}.md`,
    contentType: 'text/markdown',
    data: Buffer.from(emailMd, 'utf8'),
    extractedText: emailMd,
    extractionNote: 'filed via Outlook add-in',
    uploadedBy: input.acting,
  });

  const docIds: string[] = [stored.id];
  for (const att of input.attachments ?? []) {
    try {
      const data = Buffer.from(att.base64Data, 'base64');
      const s = storeDocument({
        matterId: matter.id,
        filename: att.filename,
        contentType: att.contentType,
        data,
        extractedText: '',
        extractionNote: 'from Outlook add-in attachment',
        uploadedBy: input.acting,
      });
      docIds.push(s.id);
    } catch (err) {
      logger.warn(`attachment store failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'outlook.file_email',
    detail: input.subject,
    refTable: 'documents',
    refId: stored.id,
    metadata: { attachments: input.attachments?.length ?? 0 },
  });
  return { ok: true, matterId: matter.id, documentIds: docIds };
}

export interface OutlookCreateMatterInput {
  title: string;
  clientName: string;
  clientEmail: string;
  matterType: string;
  jurisdiction?: string;
  acting: string;
}

export function createMatterFromOutlook(input: OutlookCreateMatterInput): { matterId: string; matterNumber: string } {
  const matter = createMatter({
    matter_number: nextMatterNumber(),
    title: input.title,
    client_name: input.clientName,
    client_email: input.clientEmail,
    matter_type: input.matterType,
    jurisdiction: input.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
    responsible_lawyer_email: input.acting,
    notes: 'Created via Outlook add-in',
  });
  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'outlook.create_matter',
    detail: matter.matter_number,
    refTable: 'matters',
    refId: matter.id,
  });
  return { matterId: matter.id, matterNumber: matter.matter_number };
}

export interface MatterSummaryForAddin {
  matterId: string;
  matterNumber: string;
  title: string;
  clientName: string;
  status: string;
  responsibleLawyerEmail: string | null;
}

export function getMatterSummaryForAddin(matterIdOrNumber: string): MatterSummaryForAddin | null {
  let matter = getMatterById(matterIdOrNumber);
  if (!matter) matter = getMatterByNumber(matterIdOrNumber);
  if (!matter) return null;
  return {
    matterId: matter.id,
    matterNumber: matter.matter_number,
    title: matter.title,
    clientName: matter.client_name,
    status: matter.status,
    responsibleLawyerEmail: matter.responsible_lawyer_email,
  };
}

export interface CreateTaskFromEmailInput {
  matterId: string;
  description: string;
  assignee: string;
  dueDate?: string;
  acting: string;
}

export function createTaskFromEmail(input: CreateTaskFromEmailInput): { ok: boolean } {
  postMessage({
    matterId: input.matterId,
    authorEmail: input.acting,
    body: input.description,
    isActionItem: true,
    actionAssignee: input.assignee,
    actionDueDate: input.dueDate,
  });
  return { ok: true };
}

export interface CreateDeadlineFromEmailInput {
  matterId: string;
  description: string;
  dueDate: string;
  acting: string;
}

export function createDeadlineFromEmail(input: CreateDeadlineFromEmailInput): { ok: boolean } {
  upsertDeadline({
    matter_id: input.matterId,
    deadline_type: 'procedural',
    description: input.description,
    due_date: input.dueDate,
    jurisdiction_basis: 'Identified via Outlook add-in',
  });
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.acting,
    action: 'outlook.create_deadline',
    detail: input.description,
    refTable: 'deadlines',
    refId: null,
  });
  return { ok: true };
}
