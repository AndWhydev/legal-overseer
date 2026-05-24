/**
 * 9.3 — Matter supervision (secondary review).
 *
 * When a matter is set to supervised mode, any review-queue item
 * approved by a junior lawyer enters a secondary_reviews queue for
 * the supervising partner. The partner can approve, edit, or reject.
 * Configurable supervision level (all outputs, client only, court only).
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getReviewById, approveReview, rejectReview, type ReviewQueueRow } from '../compliance/reviewGate.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('Supervision');

export type SupervisionLevel = 'all' | 'client_only' | 'court_only';

export interface MatterSupervision {
  matter_id: string;
  supervising_partner_email: string;
  supervision_level: SupervisionLevel;
  enabled: number;
  created_at: string;
}

export interface SecondaryReview {
  id: string;
  review_id: string;
  matter_id: string;
  supervisor_email: string;
  status: 'pending' | 'approved' | 'edited' | 'rejected';
  original_body: string | null;
  edited_body: string | null;
  supervisor_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export function enableSupervision(input: {
  matterId: string;
  supervisingPartnerEmail: string;
  level: SupervisionLevel;
  acting: string;
}): MatterSupervision {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO matter_supervision
       (matter_id, supervising_partner_email, supervision_level, enabled, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run(input.matterId, input.supervisingPartnerEmail, input.level, new Date().toISOString());
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.acting,
    action: 'supervision.enable',
    detail: `${input.supervisingPartnerEmail} (${input.level})`,
    refTable: 'matter_supervision',
    refId: input.matterId,
  });
  return getSupervision(input.matterId) as MatterSupervision;
}

export function disableSupervision(matterId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE matter_supervision SET enabled = 0 WHERE matter_id = ?`).run(matterId);
  appendLegalAudit({
    matterId,
    actorId: acting,
    action: 'supervision.disable',
    detail: '',
    refTable: 'matter_supervision',
    refId: matterId,
  });
}

export function getSupervision(matterId: string): MatterSupervision | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM matter_supervision WHERE matter_id = ?').get(matterId) as
      | MatterSupervision
      | undefined) ?? null
  );
}

function reviewNeedsSecondary(review: ReviewQueueRow, sup: MatterSupervision): boolean {
  if (sup.enabled !== 1) return false;
  if (sup.supervision_level === 'all') return true;
  if (sup.supervision_level === 'client_only') {
    return review.output_kind === 'client_email' || review.output_kind === 'drafted_document';
  }
  if (sup.supervision_level === 'court_only') {
    return review.output_kind === 'drafted_document';
  }
  return false;
}

/**
 * Wrap approveReview. If the matter is supervised and the supervision
 * level captures this output kind, queue a secondary review instead of
 * fully approving. Returns either the full approval row or the
 * pending secondary review.
 */
export function juniorApprove(reviewId: string, juniorEmail: string, note?: string): { status: 'approved' | 'pending_supervision'; row: SecondaryReview | ReviewQueueRow } {
  const review = getReviewById(reviewId);
  if (!review) throw new Error(`review ${reviewId} not found`);
  const sup = review.matter_id ? getSupervision(review.matter_id) : null;
  if (sup && reviewNeedsSecondary(review, sup)) {
    const db = getDatabase();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO secondary_reviews
         (id, review_id, matter_id, supervisor_email, status, original_body, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(id, reviewId, review.matter_id, sup.supervising_partner_email, review.body_markdown, new Date().toISOString());
    appendLegalAudit({
      matterId: review.matter_id,
      actorId: juniorEmail,
      action: 'supervision.queued',
      detail: `${review.title} → ${sup.supervising_partner_email}`,
      refTable: 'secondary_reviews',
      refId: id,
    });
    sendNotification(
      `[Supervision] Review needed: ${review.title}`,
      `<p>${juniorEmail} has approved a review item that needs your sign-off.</p><p>Title: ${review.title}</p>`,
      sup.supervising_partner_email,
    ).catch(() => undefined);
    return { status: 'pending_supervision', row: db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(id) as SecondaryReview };
  }
  return { status: 'approved', row: approveReview({ reviewId, reviewer: juniorEmail, note }) };
}

export function supervisorApprove(secondaryId: string, supervisorEmail: string, note?: string): SecondaryReview {
  const db = getDatabase();
  const sec = db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview | undefined;
  if (!sec) throw new Error(`secondary review ${secondaryId} not found`);
  db.prepare(
    `UPDATE secondary_reviews SET status = 'approved', supervisor_note = ?, reviewed_at = ? WHERE id = ?`,
  ).run(note ?? null, new Date().toISOString(), secondaryId);
  approveReview({ reviewId: sec.review_id, reviewer: supervisorEmail, note });
  appendLegalAudit({
    matterId: sec.matter_id,
    actorId: supervisorEmail,
    action: 'supervision.approve',
    detail: '',
    refTable: 'secondary_reviews',
    refId: secondaryId,
  });
  return db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview;
}

export function supervisorEdit(secondaryId: string, supervisorEmail: string, editedBody: string, note?: string): SecondaryReview {
  const db = getDatabase();
  const sec = db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview | undefined;
  if (!sec) throw new Error(`secondary review ${secondaryId} not found`);
  // Update the underlying review body.
  db.prepare(`UPDATE review_queue SET body_markdown = ? WHERE id = ?`).run(editedBody, sec.review_id);
  db.prepare(
    `UPDATE secondary_reviews SET status = 'edited', edited_body = ?, supervisor_note = ?, reviewed_at = ? WHERE id = ?`,
  ).run(editedBody, note ?? null, new Date().toISOString(), secondaryId);
  approveReview({ reviewId: sec.review_id, reviewer: supervisorEmail, note: `Supervisor-edited: ${note ?? ''}` });
  appendLegalAudit({
    matterId: sec.matter_id,
    actorId: supervisorEmail,
    action: 'supervision.edit',
    detail: '',
    refTable: 'secondary_reviews',
    refId: secondaryId,
  });
  return db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview;
}

export function supervisorReject(secondaryId: string, supervisorEmail: string, note?: string): SecondaryReview {
  const db = getDatabase();
  const sec = db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview | undefined;
  if (!sec) throw new Error(`secondary review ${secondaryId} not found`);
  db.prepare(
    `UPDATE secondary_reviews SET status = 'rejected', supervisor_note = ?, reviewed_at = ? WHERE id = ?`,
  ).run(note ?? null, new Date().toISOString(), secondaryId);
  rejectReview({ reviewId: sec.review_id, reviewer: supervisorEmail, note: note ?? 'rejected by supervisor' });
  appendLegalAudit({
    matterId: sec.matter_id,
    actorId: supervisorEmail,
    action: 'supervision.reject',
    detail: note ?? '',
    refTable: 'secondary_reviews',
    refId: secondaryId,
  });
  return db.prepare('SELECT * FROM secondary_reviews WHERE id = ?').get(secondaryId) as SecondaryReview;
}

export function listPendingSecondaryReviews(supervisorEmail?: string): SecondaryReview[] {
  const db = getDatabase();
  if (supervisorEmail) {
    return db
      .prepare(`SELECT * FROM secondary_reviews WHERE status = 'pending' AND supervisor_email = ? ORDER BY created_at`)
      .all(supervisorEmail) as SecondaryReview[];
  }
  return db
    .prepare(`SELECT * FROM secondary_reviews WHERE status = 'pending' ORDER BY created_at`)
    .all() as SecondaryReview[];
}
