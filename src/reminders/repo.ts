/**
 * deadline_reminders repository.
 *
 * One row per (deadline, offset_days) pair so we never double-send.
 * The dispatcher walks open deadlines, computes the days-remaining
 * bucket, and inserts a row before sending. The unique index guards
 * against races between the dispatcher and a manual trigger.
 *
 * Snooze + dismiss columns let a lawyer pause reminders for a
 * deadline without resolving it. A snoozed row blocks any further
 * reminder for that offset until the snooze expires.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';

export const REMINDER_OFFSETS = [30, 14, 7, 1] as const;
export type ReminderOffset = typeof REMINDER_OFFSETS[number];

export interface DeadlineReminderRow {
  id: string;
  deadline_id: string;
  matter_id: string;
  offset_days: number;
  sent_to: string;
  sent_at: string;
  message_id: string | null;
  snoozed_until: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
}

export interface RecordReminderInput {
  deadline_id: string;
  matter_id: string;
  offset_days: number;
  sent_to: string;
  message_id?: string;
}

export function recordReminder(input: RecordReminderInput): DeadlineReminderRow {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO deadline_reminders
       (id, deadline_id, matter_id, offset_days, sent_to, sent_at, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.deadline_id, input.matter_id, input.offset_days, input.sent_to, now, input.message_id ?? null);
  return getReminderById(id) as DeadlineReminderRow;
}

export function getReminderById(id: string): DeadlineReminderRow | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM deadline_reminders WHERE id = ?').get(id) as DeadlineReminderRow | undefined) ?? null;
}

export function hasReminderBeenSent(deadlineId: string, offsetDays: number): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT id FROM deadline_reminders
       WHERE deadline_id = ? AND offset_days = ? AND dismissed_at IS NULL
       LIMIT 1`,
    )
    .get(deadlineId, offsetDays) as { id: string } | undefined;
  return !!row;
}

export function listRemindersForDeadline(deadlineId: string): DeadlineReminderRow[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM deadline_reminders WHERE deadline_id = ? ORDER BY sent_at DESC')
    .all(deadlineId) as DeadlineReminderRow[];
}

export function listRecentReminders(limit = 100): DeadlineReminderRow[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM deadline_reminders ORDER BY sent_at DESC LIMIT ?')
    .all(limit) as DeadlineReminderRow[];
}

export function snoozeDeadline(deadlineId: string, untilIso: string, by: string): void {
  const db = getDatabase();
  // Add a snooze row at offset -1 (sentinel) so the dispatcher will
  // notice and skip all reminder offsets until the snooze expires.
  db.prepare(
    `INSERT INTO deadline_reminders (id, deadline_id, matter_id, offset_days, sent_to, snoozed_until)
     SELECT ?, id, matter_id, -1, ?, ?
     FROM deadlines WHERE id = ?`,
  ).run(randomUUID(), by, untilIso, deadlineId);
}

export function isDeadlineSnoozed(deadlineId: string): boolean {
  const db = getDatabase();
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT id FROM deadline_reminders
       WHERE deadline_id = ? AND offset_days = -1
         AND snoozed_until IS NOT NULL AND snoozed_until > ?
         AND dismissed_at IS NULL
       LIMIT 1`,
    )
    .get(deadlineId, nowIso) as { id: string } | undefined;
  return !!row;
}

export function dismissReminder(reminderId: string, by: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE deadline_reminders SET dismissed_at = ?, dismissed_by = ? WHERE id = ?`,
  ).run(now, by, reminderId);
}

export function dismissDeadline(deadlineId: string, by: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE deadline_reminders SET dismissed_at = ?, dismissed_by = ?
     WHERE deadline_id = ? AND dismissed_at IS NULL`,
  ).run(now, by, deadlineId);
}
