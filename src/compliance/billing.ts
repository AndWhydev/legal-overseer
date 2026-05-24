/**
 * Billing transparency log.
 *
 * Hard product constraint: every AI minute and every dollar of model
 * spend per matter must be inspectable next to the lawyer's own time
 * entry so the firm can disclose the AI's share to the client.
 *
 * This module records:
 *   - actual AI wall-clock time per skill run
 *   - actual model spend (USD) from the SDK total_cost_usd
 *   - lawyer-billable time entered by humans against the matter
 *   - the difference (so the dashboard can render an "AI saved 35
 *     billable minutes" or "AI added 8 billable minutes" headline)
 *
 * Time is stored in seconds for arithmetic ease; the dashboard
 * displays in minutes/hours.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from './audit.js';

export type BillingEntryKind = 'ai_run' | 'lawyer_time';

export interface BillingEntry {
  id: string;
  matter_id: string;
  kind: BillingEntryKind;
  /** Skill id for ai_run rows; lawyer id (email) for lawyer_time rows. */
  actor_id: string;
  /** Human-readable description of what was done. */
  description: string;
  /** Wall-clock duration in seconds. */
  duration_seconds: number;
  /** AI model cost (USD). Null for lawyer_time rows. */
  cost_usd: number | null;
  /** Optional link to the originating review_queue row. */
  review_id: string | null;
  /** Optional link to the originating task row. */
  task_id: string | null;
  created_at: string;
}

export interface RecordAiRunInput {
  matterId: string;
  skillId: string;
  description: string;
  durationSeconds: number;
  costUsd: number;
  reviewId?: string;
  taskId?: string;
}

export interface RecordLawyerTimeInput {
  matterId: string;
  lawyerId: string;
  description: string;
  durationSeconds: number;
  reviewId?: string;
}

export function recordAiRun(input: RecordAiRunInput): BillingEntry {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO billing_log (
      id, matter_id, kind, actor_id, description,
      duration_seconds, cost_usd, review_id, task_id, created_at
    )
    VALUES (?, ?, 'ai_run', ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.matterId,
    input.skillId,
    input.description,
    Math.max(0, Math.round(input.durationSeconds)),
    input.costUsd,
    input.reviewId ?? null,
    input.taskId ?? null,
    now,
  );
  appendLegalAudit({
    matterId: input.matterId,
    actorId: `skill:${input.skillId}`,
    action: 'billing.ai_run',
    detail: input.description,
    refTable: 'billing_log',
    refId: id,
    metadata: { durationSeconds: input.durationSeconds, costUsd: input.costUsd },
  });
  return getBillingEntry(id) as BillingEntry;
}

export function recordLawyerTime(input: RecordLawyerTimeInput): BillingEntry {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO billing_log (
      id, matter_id, kind, actor_id, description,
      duration_seconds, cost_usd, review_id, task_id, created_at
    )
    VALUES (?, ?, 'lawyer_time', ?, ?, ?, NULL, ?, NULL, ?)
    `,
  ).run(
    id,
    input.matterId,
    input.lawyerId,
    input.description,
    Math.max(0, Math.round(input.durationSeconds)),
    input.reviewId ?? null,
    now,
  );
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.lawyerId,
    action: 'billing.lawyer_time',
    detail: input.description,
    refTable: 'billing_log',
    refId: id,
    metadata: { durationSeconds: input.durationSeconds },
  });
  return getBillingEntry(id) as BillingEntry;
}

export function getBillingEntry(id: string): BillingEntry | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM billing_log WHERE id = ?`)
    .get(id) as BillingEntry | undefined;
  return row ?? null;
}

export interface MatterBillingSummary {
  matterId: string;
  aiSeconds: number;
  aiCostUsd: number;
  aiRuns: number;
  lawyerSeconds: number;
  lawyerEntries: number;
}

export function summariseMatterBilling(matterId: string): MatterBillingSummary {
  const db = getDatabase();
  const row = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN kind = 'ai_run' THEN duration_seconds ELSE 0 END) AS aiSeconds,
        SUM(CASE WHEN kind = 'ai_run' THEN cost_usd ELSE 0 END) AS aiCostUsd,
        SUM(CASE WHEN kind = 'ai_run' THEN 1 ELSE 0 END) AS aiRuns,
        SUM(CASE WHEN kind = 'lawyer_time' THEN duration_seconds ELSE 0 END) AS lawyerSeconds,
        SUM(CASE WHEN kind = 'lawyer_time' THEN 1 ELSE 0 END) AS lawyerEntries
      FROM billing_log
      WHERE matter_id = ?
      `,
    )
    .get(matterId) as {
    aiSeconds: number | null;
    aiCostUsd: number | null;
    aiRuns: number | null;
    lawyerSeconds: number | null;
    lawyerEntries: number | null;
  };
  return {
    matterId,
    aiSeconds: row.aiSeconds ?? 0,
    aiCostUsd: row.aiCostUsd ?? 0,
    aiRuns: row.aiRuns ?? 0,
    lawyerSeconds: row.lawyerSeconds ?? 0,
    lawyerEntries: row.lawyerEntries ?? 0,
  };
}

export function listMatterBilling(matterId: string, limit = 200): BillingEntry[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM billing_log WHERE matter_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(matterId, limit) as BillingEntry[];
}
