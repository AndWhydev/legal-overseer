/**
 * Deadlines repository.
 *
 * Stores every limitation period, court-set date, procedural deadline,
 * and internal SLA the system has identified for a matter. The
 * matter_management skill writes via upsertDeadline(); the reminder
 * scheduler walks pending rows; the dashboard renders the calendar
 * view from listUpcoming().
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';

export type DeadlineType = 'limitation' | 'court' | 'procedural' | 'internal_sla' | 'client';
export type DeadlineStatus = 'open' | 'reminded' | 'met' | 'missed' | 'waived';

export interface Deadline {
  id: string;
  matter_id: string;
  deadline_type: DeadlineType;
  description: string;
  due_date: string;
  jurisdiction_basis: string | null;
  consequence_if_missed: string | null;
  recommended_action: string | null;
  reminder_draft: string | null;
  status: DeadlineStatus;
  reminded_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertDeadlineInput {
  matter_id: string;
  deadline_type: DeadlineType;
  description: string;
  due_date: string;
  jurisdiction_basis?: string | null;
  consequence_if_missed?: string | null;
  recommended_action?: string | null;
  reminder_draft?: string | null;
}

/**
 * Insert or update a deadline. The dedupe index is
 * (matter_id, deadline_type, description, due_date) so re-running the
 * matter_management skill is idempotent for the same finding.
 */
export function upsertDeadline(input: UpsertDeadlineInput): Deadline {
  const db = getDatabase();
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      `SELECT * FROM deadlines
       WHERE matter_id = ? AND deadline_type = ?
         AND description = ? AND due_date = ?
       LIMIT 1`,
    )
    .get(
      input.matter_id,
      input.deadline_type,
      input.description,
      input.due_date,
    ) as Deadline | undefined;

  if (existing) {
    db.prepare(
      `UPDATE deadlines SET
         jurisdiction_basis = ?, consequence_if_missed = ?,
         recommended_action = ?, reminder_draft = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.jurisdiction_basis ?? existing.jurisdiction_basis,
      input.consequence_if_missed ?? existing.consequence_if_missed,
      input.recommended_action ?? existing.recommended_action,
      input.reminder_draft ?? existing.reminder_draft,
      now,
      existing.id,
    );
    return getDeadlineById(existing.id) as Deadline;
  }

  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO deadlines (
      id, matter_id, deadline_type, description, due_date,
      jurisdiction_basis, consequence_if_missed, recommended_action,
      reminder_draft, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `,
  ).run(
    id,
    input.matter_id,
    input.deadline_type,
    input.description,
    input.due_date,
    input.jurisdiction_basis ?? null,
    input.consequence_if_missed ?? null,
    input.recommended_action ?? null,
    input.reminder_draft ?? null,
    now,
    now,
  );
  return getDeadlineById(id) as Deadline;
}

export function getDeadlineById(id: string): Deadline | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM deadlines WHERE id = ?`).get(id) as
    | Deadline
    | undefined;
  return row ?? null;
}

export function listDeadlinesForMatter(matterId: string): Deadline[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM deadlines WHERE matter_id = ? ORDER BY due_date ASC`,
    )
    .all(matterId) as Deadline[];
}

/**
 * Walk every open deadline due within `windowDays` of `from`. Used by
 * the dashboard calendar and the reminder scheduler.
 */
export function listUpcoming(windowDays = 30, from: Date = new Date()): Deadline[] {
  const db = getDatabase();
  const fromIso = from.toISOString().slice(0, 10);
  const horizon = new Date(from.getTime() + windowDays * 86400_000)
    .toISOString()
    .slice(0, 10);
  return db
    .prepare(
      `SELECT * FROM deadlines
       WHERE status = 'open'
         AND due_date >= ? AND due_date <= ?
       ORDER BY due_date ASC`,
    )
    .all(fromIso, horizon) as Deadline[];
}

export function markReminded(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE deadlines SET status = 'reminded', reminded_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, id);
}

export function resolveDeadline(id: string, status: 'met' | 'missed' | 'waived'): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE deadlines SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
  ).run(status, now, now, id);
}
