/**
 * 4.4 — File review scheduler.
 *
 * Every matter is assigned a review interval based on type. Overdue
 * reviews are flagged in the dashboard and escalated to the
 * supervising partner if 14+ days late.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getMatterById, listMatters, type Matter } from '../db/repositories/matters.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('FileReview');

export interface FileReviewSchedule {
  id: string;
  matter_id: string;
  review_interval_days: number;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  last_review_note: string | null;
  next_due_at: string;
  escalated_at: string | null;
}

const INTERVAL_BY_TYPE: Record<string, number> = {
  litigation: 30,
  family: 30,
  criminal: 30,
  commercial: 60,
  contract: 60,
  property: 60,
  estates: 60,
  employment: 60,
  immigration: 60,
  regulatory: 60,
  wills: 90,
  unclassified: 60,
};

function defaultIntervalFor(matter: Matter): number {
  return INTERVAL_BY_TYPE[matter.matter_type] ?? 60;
}

export function ensureSchedule(matterId: string): FileReviewSchedule {
  const matter = getMatterById(matterId);
  if (!matter) throw new Error(`matter ${matterId} not found`);
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM file_review_schedules WHERE matter_id = ?')
    .get(matterId) as FileReviewSchedule | undefined;
  if (existing) return existing;
  const interval = defaultIntervalFor(matter);
  const next = new Date(Date.now() + interval * 86400000).toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO file_review_schedules
       (id, matter_id, review_interval_days, next_due_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, matter.id, interval, next);
  return db.prepare('SELECT * FROM file_review_schedules WHERE id = ?').get(id) as FileReviewSchedule;
}

export function recordReview(matterId: string, acting: string, note?: string): FileReviewSchedule {
  const sched = ensureSchedule(matterId);
  const db = getDatabase();
  const now = new Date().toISOString();
  const next = new Date(Date.now() + sched.review_interval_days * 86400000).toISOString();
  db.prepare(
    `UPDATE file_review_schedules
       SET last_reviewed_at = ?, last_reviewed_by = ?, last_review_note = ?,
           next_due_at = ?, escalated_at = NULL
     WHERE id = ?`,
  ).run(now, acting, note ?? null, next, sched.id);
  appendLegalAudit({
    matterId,
    actorId: acting,
    action: 'file_review.complete',
    detail: note ?? '',
    refTable: 'file_review_schedules',
    refId: sched.id,
  });
  return db.prepare('SELECT * FROM file_review_schedules WHERE id = ?').get(sched.id) as FileReviewSchedule;
}

export function listOverdueReviews(): { schedule: FileReviewSchedule; matter: Matter }[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  const rows = db
    .prepare(`SELECT * FROM file_review_schedules WHERE next_due_at < ? ORDER BY next_due_at`)
    .all(now) as FileReviewSchedule[];
  const out: { schedule: FileReviewSchedule; matter: Matter }[] = [];
  for (const r of rows) {
    const m = getMatterById(r.matter_id);
    if (m) out.push({ schedule: r, matter: m });
  }
  return out;
}

export function dispatchReviewReminders(): { sent: number; escalated: number } {
  const db = getDatabase();
  const overdue = listOverdueReviews();
  const now = Date.now();
  let sent = 0;
  let escalated = 0;
  for (const { schedule, matter } of overdue) {
    const daysOverdue = Math.floor(
      (now - new Date(schedule.next_due_at).getTime()) / (24 * 3600 * 1000),
    );
    if (daysOverdue >= 14 && !schedule.escalated_at) {
      // Escalate.
      if (process.env.ADMIN_EMAIL) {
        sendNotification(
          `[File review] ${matter.matter_number} overdue ${daysOverdue} days — ESCALATED`,
          `<p>Matter <b>${matter.matter_number} — ${matter.title}</b> is ${daysOverdue} days overdue for file review.</p>`,
          process.env.ADMIN_EMAIL,
        ).catch(() => undefined);
      }
      db.prepare(`UPDATE file_review_schedules SET escalated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        schedule.id,
      );
      escalated += 1;
    } else if (matter.responsible_lawyer_email) {
      sendNotification(
        `[File review] ${matter.matter_number} due for review`,
        `<p>Matter <b>${matter.matter_number} — ${matter.title}</b> is due for its periodic file review (${daysOverdue} days past due).</p>`,
        matter.responsible_lawyer_email,
      ).catch(() => undefined);
      sent += 1;
    }
  }
  if (sent || escalated) logger.info(`reminders: ${sent} sent, ${escalated} escalated`);
  return { sent, escalated };
}

export function ensureSchedulesForAllOpenMatters(): { created: number } {
  let created = 0;
  for (const m of listMatters('open')) {
    const db = getDatabase();
    const exists = db
      .prepare('SELECT 1 FROM file_review_schedules WHERE matter_id = ?')
      .get(m.id);
    if (!exists) {
      ensureSchedule(m.id);
      created += 1;
    }
  }
  return { created };
}

export interface FileReviewReport {
  period: string;
  total: number;
  onTime: number;
  late: number;
  escalated: number;
}

export function generateFileReviewReport(period: string): FileReviewReport {
  const db = getDatabase();
  const all = db
    .prepare(`SELECT * FROM file_review_schedules`)
    .all() as FileReviewSchedule[];
  let onTime = 0;
  let late = 0;
  let escalated = 0;
  for (const s of all) {
    if (s.last_reviewed_at && s.last_reviewed_at.startsWith(period)) {
      onTime += 1;
    } else if (s.escalated_at && s.escalated_at.startsWith(period)) {
      escalated += 1;
    } else if (s.next_due_at < new Date().toISOString()) {
      late += 1;
    }
  }
  return { period, total: all.length, onTime, late, escalated };
}
