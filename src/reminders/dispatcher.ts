/**
 * Deadline reminder dispatcher.
 *
 * Runs daily (default 07:30 server time, overridable via
 * REMINDER_CRON). Walks every open deadline, computes days-remaining,
 * and for each of the 30/14/7/1-day buckets sends an email to the
 * responsible lawyer (or ADMIN_EMAIL fallback). Each (deadline, offset)
 * pair is recorded so re-runs are idempotent.
 *
 * Snoozes block the dispatcher: a deadline with an active snooze is
 * skipped for ALL offsets until the snooze expires.
 */

import cron from 'node-cron';
import { createSafeLogger } from '../governance/index.js';
import { getDatabase } from '../db/connection.js';
import { sendNotification, isEmailConfigured } from '../email/notifier.js';
import { getMatterById } from '../db/repositories/matters.js';
import type { Deadline } from '../db/repositories/deadlines.js';
import {
  REMINDER_OFFSETS,
  hasReminderBeenSent,
  isDeadlineSnoozed,
  recordReminder,
} from './repo.js';
import { appendLegalAudit } from '../compliance/audit.js';

const logger = createSafeLogger('ReminderDispatcher');

export const DEFAULT_REMINDER_CRON = '30 7 * * *';
type ScheduledTask = ReturnType<typeof cron.schedule>;
let scheduled: ScheduledTask | null = null;

function daysUntil(due: string, now: Date = new Date()): number {
  const target = new Date(`${due.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.ceil((target - now.getTime()) / 86400000);
}

function pickOffset(daysLeft: number): number | null {
  for (const off of REMINDER_OFFSETS) {
    if (daysLeft === off) return off;
  }
  // Overdue items: re-remind once per day until resolved (offset = -daysLeft if negative).
  if (daysLeft < 0) return daysLeft; // a unique key per overdue day so the dispatcher keeps notifying.
  return null;
}

function buildEmailHtml(deadline: Deadline, matterNumber: string | null, daysLeft: number): string {
  const overdue = daysLeft < 0;
  const subjectLine = overdue
    ? `<b>OVERDUE BY ${Math.abs(daysLeft)} DAY(S):</b> ${deadline.description}`
    : daysLeft === 0
      ? `<b>DUE TODAY:</b> ${deadline.description}`
      : `<b>${daysLeft} DAY(S) UNTIL:</b> ${deadline.description}`;
  const matterRef = matterNumber ? `<p><b>Matter:</b> ${matterNumber}</p>` : '';
  return `
    <h2>${subjectLine}</h2>
    ${matterRef}
    <p><b>Due:</b> ${deadline.due_date}</p>
    <p><b>Type:</b> ${deadline.deadline_type}</p>
    ${deadline.consequence_if_missed ? `<p><b>If missed:</b> ${deadline.consequence_if_missed}</p>` : ''}
    ${deadline.recommended_action ? `<p><b>Recommended action:</b> ${deadline.recommended_action}</p>` : ''}
    ${deadline.reminder_draft ? `<hr/><p><b>Draft reminder text:</b></p><pre style="white-space:pre-wrap">${escapeBasic(deadline.reminder_draft)}</pre>` : ''}
    <hr/>
    <p style="color:#888;font-size:12px">Reminder issued by Legal Overseer. Snooze or dismiss from /calendar.</p>
  `;
}

function escapeBasic(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c));
}

export interface ReminderRunResult {
  scanned: number;
  sent: number;
  skippedSnoozed: number;
  alreadySent: number;
  notDue: number;
  errors: string[];
}

export async function runReminderSweep(now: Date = new Date()): Promise<ReminderRunResult> {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT * FROM deadlines WHERE status IN ('open', 'reminded')`,
  ).all() as Deadline[];

  const result: ReminderRunResult = {
    scanned: rows.length,
    sent: 0,
    skippedSnoozed: 0,
    alreadySent: 0,
    notDue: 0,
    errors: [],
  };

  if (!isEmailConfigured()) {
    logger.warn('SMTP not configured — reminders will be recorded but no email sent.');
  }

  for (const d of rows) {
    const daysLeft = daysUntil(d.due_date, now);
    const offset = pickOffset(daysLeft);
    if (offset === null) { result.notDue += 1; continue; }
    if (isDeadlineSnoozed(d.id)) { result.skippedSnoozed += 1; continue; }
    if (hasReminderBeenSent(d.id, offset)) { result.alreadySent += 1; continue; }

    const matter = getMatterById(d.matter_id);
    const recipient = matter?.responsible_lawyer_email
      || process.env.INTAKE_LAWYER_EMAIL
      || process.env.ADMIN_EMAIL
      || 'unknown@localhost';

    const subject = daysLeft < 0
      ? `[OVERDUE] ${d.description}`
      : daysLeft === 0
        ? `[TODAY] ${d.description}`
        : `[${daysLeft}d] ${d.description}`;

    let messageId: string | undefined;
    try {
      messageId = await sendNotification(
        subject,
        buildEmailHtml(d, matter?.matter_number ?? null, daysLeft),
        recipient,
      );
    } catch (err) {
      result.errors.push(`${d.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    recordReminder({
      deadline_id: d.id,
      matter_id: d.matter_id,
      offset_days: offset,
      sent_to: recipient,
      message_id: messageId,
    });

    appendLegalAudit({
      matterId: d.matter_id,
      actorId: 'reminder-dispatcher',
      action: 'deadline.reminder_sent',
      detail: `${offset >= 0 ? offset + ' day' : 'overdue ' + Math.abs(offset) + ' day'} reminder → ${recipient} for "${d.description}"`,
      refTable: 'deadlines', refId: d.id,
    });
    result.sent += 1;
  }

  logger.info(`reminder sweep: scanned=${result.scanned} sent=${result.sent} snoozed=${result.skippedSnoozed} already=${result.alreadySent}`);
  return result;
}

export function initReminderScheduler(): void {
  if (process.env.REMINDERS_DISABLED === 'true') {
    logger.info('Disabled (REMINDERS_DISABLED=true)');
    return;
  }
  if (scheduled) return;
  const expr = process.env.REMINDER_CRON || DEFAULT_REMINDER_CRON;
  scheduled = cron.schedule(expr, () => {
    runReminderSweep().catch((err) => {
      logger.error(`reminder sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  });
  logger.info(`Reminder scheduler started (cron: ${expr})`);
}

export function stopReminderScheduler(): void {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
    logger.info('Reminder scheduler stopped');
  }
}
