/**
 * Human review gate.
 *
 * Hard product constraint: nothing reaches a client or court without
 * a named lawyer's approval. Skill output is wrapped by
 * enqueueForReview() into a review_queue row marked status='pending'.
 * Outbound channels (SMTP send, court-filing connector) MUST refuse
 * to ship anything whose review_queue row is not status='approved'.
 *
 * The runtime check is intentionally aggressive: every queue insert
 * also writes an immutable legal_audit_log entry so we can prove,
 * later, who approved what and when. Approval cannot be back-dated.
 *
 * The dashboard's /review surface reads from this module's helpers so
 * the reviewer sees exactly what came in, what skill produced it, and
 * what cost was billed.
 */

import { randomUUID } from 'node:crypto';
import { createSafeLogger } from '../governance/index.js';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from './audit.js';
import { hasDisclaimer } from './disclaimer.js';

const logger = createSafeLogger('ReviewGate');

export type OutputKind =
  | 'contract_review'
  | 'research_memo'
  | 'drafted_document'
  | 'client_email'
  | 'matter_management'
  | 'regulatory_alert';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'sent';

export interface ReviewQueueRow {
  id: string;
  matter_id: string | null;
  matter_number: string | null;
  skill_id: string;
  output_kind: OutputKind;
  /** Free-text label shown in the queue list (matter+document title). */
  title: string;
  /** Markdown body — already disclaimer-wrapped. */
  body_markdown: string;
  /** JSON metadata blob (recipient address, citations, deadlines, etc.). */
  metadata_json: string | null;
  status: ReviewStatus;
  /** Email of the lawyer who reviewed / rejected. Null while pending. */
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Rejection / approval note. */
  review_note: string | null;
  created_at: string;
  cost_usd: number | null;
}

export interface EnqueueInput {
  matterId: string | null;
  matterNumber: string | null;
  skillId: string;
  outputKind: OutputKind;
  title: string;
  bodyMarkdown: string;
  metadata?: Record<string, unknown>;
  costUsd?: number;
}

/**
 * Insert a skill output into the review queue. Refuses the insert if
 * the body is missing the AI disclaimer block — fail loud rather than
 * let a non-compliant draft slip into the queue.
 */
export function enqueueForReview(input: EnqueueInput): ReviewQueueRow {
  if (!hasDisclaimer(input.bodyMarkdown)) {
    throw new Error(
      `reviewGate refuses to enqueue ${input.outputKind} for ${input.matterNumber ?? input.matterId ?? 'ad-hoc'}: AI disclaimer missing.`,
    );
  }

  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  db.prepare(
    `
    INSERT INTO review_queue (
      id, matter_id, matter_number, skill_id, output_kind, title,
      body_markdown, metadata_json, status, cost_usd, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `,
  ).run(
    id,
    input.matterId,
    input.matterNumber,
    input.skillId,
    input.outputKind,
    input.title,
    input.bodyMarkdown,
    metadataJson,
    input.costUsd ?? null,
    now,
  );

  appendLegalAudit({
    matterId: input.matterId,
    actorId: `skill:${input.skillId}`,
    action: 'review_queue.enqueue',
    detail: `${input.outputKind} → ${input.title}`,
    refTable: 'review_queue',
    refId: id,
    metadata: { costUsd: input.costUsd ?? null },
  });

  logger.info(
    `enqueued ${input.outputKind} for matter ${input.matterNumber ?? '(ad-hoc)'} → ${id}`,
  );

  return getReviewById(id) as ReviewQueueRow;
}

export function getReviewById(id: string): ReviewQueueRow | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM review_queue WHERE id = ?').get(id) as
    | ReviewQueueRow
    | undefined;
  return row ?? null;
}

export function listPendingReviews(limit = 200): ReviewQueueRow[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM review_queue WHERE status = 'pending'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as ReviewQueueRow[];
}

export function listReviewsByStatus(status: ReviewStatus, limit = 200): ReviewQueueRow[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM review_queue WHERE status = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(status, limit) as ReviewQueueRow[];
}

export interface ReviewDecisionInput {
  reviewId: string;
  reviewer: string;
  note?: string;
}

/**
 * Approve a queued item. The audit entry records the reviewer + note;
 * the row status flips to 'approved'. Outbound channels are responsible
 * for flipping to 'sent' once the message has actually shipped.
 */
export function approveReview(input: ReviewDecisionInput): ReviewQueueRow {
  const db = getDatabase();
  const now = new Date().toISOString();
  const row = getReviewById(input.reviewId);
  if (!row) throw new Error(`review ${input.reviewId} not found`);
  if (row.status !== 'pending') {
    throw new Error(`review ${input.reviewId} already ${row.status}`);
  }

  db.prepare(
    `UPDATE review_queue
     SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?
     WHERE id = ?`,
  ).run(input.reviewer, now, input.note ?? null, input.reviewId);

  appendLegalAudit({
    matterId: row.matter_id,
    actorId: input.reviewer,
    action: 'review_queue.approve',
    detail: `${row.output_kind} → ${row.title}`,
    refTable: 'review_queue',
    refId: row.id,
    metadata: { note: input.note ?? null },
  });

  return getReviewById(input.reviewId) as ReviewQueueRow;
}

export function rejectReview(input: ReviewDecisionInput): ReviewQueueRow {
  const db = getDatabase();
  const now = new Date().toISOString();
  const row = getReviewById(input.reviewId);
  if (!row) throw new Error(`review ${input.reviewId} not found`);
  if (row.status !== 'pending') {
    throw new Error(`review ${input.reviewId} already ${row.status}`);
  }

  db.prepare(
    `UPDATE review_queue
     SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
     WHERE id = ?`,
  ).run(input.reviewer, now, input.note ?? null, input.reviewId);

  appendLegalAudit({
    matterId: row.matter_id,
    actorId: input.reviewer,
    action: 'review_queue.reject',
    detail: `${row.output_kind} → ${row.title}`,
    refTable: 'review_queue',
    refId: row.id,
    metadata: { note: input.note ?? null },
  });

  return getReviewById(input.reviewId) as ReviewQueueRow;
}

/**
 * Mark an approved item as sent (after an outbound channel ships it).
 * Refuses if the row isn't currently 'approved'.
 */
export function markReviewSent(reviewId: string, actorId: string): ReviewQueueRow {
  const db = getDatabase();
  const row = getReviewById(reviewId);
  if (!row) throw new Error(`review ${reviewId} not found`);
  if (row.status !== 'approved') {
    throw new Error(
      `cannot mark review ${reviewId} as sent: status is ${row.status}, not approved`,
    );
  }
  db.prepare(`UPDATE review_queue SET status = 'sent' WHERE id = ?`).run(reviewId);
  appendLegalAudit({
    matterId: row.matter_id,
    actorId,
    action: 'review_queue.sent',
    detail: `${row.output_kind} → ${row.title}`,
    refTable: 'review_queue',
    refId: row.id,
    metadata: null,
  });
  return getReviewById(reviewId) as ReviewQueueRow;
}

/**
 * Outbound-channel guard. Throws if the supplied reviewId is not in
 * 'approved' status. Use this in any code path that ships content
 * externally (SMTP send, court filing, etc.).
 */
export function assertApproved(reviewId: string): ReviewQueueRow {
  const row = getReviewById(reviewId);
  if (!row) throw new Error(`review ${reviewId} not found`);
  if (row.status !== 'approved') {
    throw new Error(
      `review gate blocked send: review ${reviewId} status is ${row.status}, must be approved`,
    );
  }
  return row;
}
