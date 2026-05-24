/**
 * 4.3 — Regulatory calendar.
 *
 * Pre-seeded with key Australian legal-profession dates (CPD per
 * state, trust audit, practising certificate renewal, PII renewal,
 * Law Society membership). Per-lawyer personalisation based on the
 * lawyer's home state. Reminders at 60/30/14/7 days.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { listUsers, getUserById, type User } from '../users/repo.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('RegCalendar');

export interface RegulatoryEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  jurisdiction: string | null;
  applies_to_user_id: string | null;
  applies_to_role: string | null;
  due_date: string;
  recurring: string | null;
  last_reminder_offset: number | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

const REMINDER_OFFSETS = [60, 30, 14, 7];

const SEED_TEMPLATES = [
  { title: 'CPD compliance deadline', event_type: 'cpd', due_month: 3, due_day: 31, recurring: 'yearly' },
  { title: 'Trust account audit due', event_type: 'trust_audit', due_month: 3, due_day: 31, recurring: 'yearly' },
  { title: 'Practising certificate renewal', event_type: 'practising_certificate', due_month: 6, due_day: 30, recurring: 'yearly' },
  { title: 'Professional indemnity renewal', event_type: 'pi_renewal', due_month: 6, due_day: 30, recurring: 'yearly' },
  { title: 'Law Society membership renewal', event_type: 'membership', due_month: 6, due_day: 30, recurring: 'yearly' },
];

export interface CreateEventInput {
  title: string;
  description?: string;
  event_type: string;
  jurisdiction?: string;
  applies_to_user_id?: string;
  applies_to_role?: string;
  due_date: string;
  recurring?: string;
}

export function createRegulatoryEvent(input: CreateEventInput): RegulatoryEvent {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO regulatory_calendar_events
       (id, title, description, event_type, jurisdiction,
        applies_to_user_id, applies_to_role, due_date, recurring)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.description ?? null,
    input.event_type,
    input.jurisdiction ?? null,
    input.applies_to_user_id ?? null,
    input.applies_to_role ?? null,
    input.due_date,
    input.recurring ?? null,
  );
  return getEvent(id) as RegulatoryEvent;
}

export function getEvent(id: string): RegulatoryEvent | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM regulatory_calendar_events WHERE id = ?').get(id) as
      | RegulatoryEvent
      | undefined) ?? null
  );
}

export function listUpcomingEvents(daysAhead = 90, userId?: string): RegulatoryEvent[] {
  const db = getDatabase();
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(0, 10);
  if (userId) {
    return db
      .prepare(
        `SELECT * FROM regulatory_calendar_events
         WHERE due_date >= ? AND due_date <= ? AND completed_at IS NULL
         AND (applies_to_user_id = ? OR applies_to_user_id IS NULL)
         ORDER BY due_date ASC`,
      )
      .all(now, cutoff, userId) as RegulatoryEvent[];
  }
  return db
    .prepare(
      `SELECT * FROM regulatory_calendar_events
       WHERE due_date >= ? AND due_date <= ? AND completed_at IS NULL
       ORDER BY due_date ASC`,
    )
    .all(now, cutoff) as RegulatoryEvent[];
}

export function markEventComplete(id: string, acting: string): RegulatoryEvent {
  const event = getEvent(id);
  if (!event) throw new Error(`event ${id} not found`);
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE regulatory_calendar_events SET completed_at = ?, completed_by = ? WHERE id = ?`,
  ).run(now, acting, id);
  // Auto-create next year if recurring.
  if (event.recurring === 'yearly') {
    const next = new Date(event.due_date);
    next.setFullYear(next.getFullYear() + 1);
    createRegulatoryEvent({
      title: event.title,
      description: event.description ?? undefined,
      event_type: event.event_type,
      jurisdiction: event.jurisdiction ?? undefined,
      applies_to_user_id: event.applies_to_user_id ?? undefined,
      applies_to_role: event.applies_to_role ?? undefined,
      due_date: next.toISOString().slice(0, 10),
      recurring: event.recurring,
    });
  }
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'regulatory.complete',
    detail: event.title,
    refTable: 'regulatory_calendar_events',
    refId: id,
  });
  return getEvent(id) as RegulatoryEvent;
}

/**
 * Seed standard events for a newly created lawyer.
 */
export function seedEventsForUser(user: User, jurisdiction = 'NSW'): void {
  const now = new Date();
  for (const tpl of SEED_TEMPLATES) {
    const due = new Date(now.getFullYear(), tpl.due_month - 1, tpl.due_day);
    if (due.getTime() < now.getTime()) due.setFullYear(due.getFullYear() + 1);
    createRegulatoryEvent({
      title: `${tpl.title} (${user.full_name})`,
      event_type: tpl.event_type,
      jurisdiction,
      applies_to_user_id: user.id,
      due_date: due.toISOString().slice(0, 10),
      recurring: tpl.recurring,
    });
  }
}

export function dispatchRegulatoryReminders(): { sent: number } {
  const db = getDatabase();
  const upcoming = listUpcomingEvents(60);
  const now = new Date();
  let sent = 0;
  for (const e of upcoming) {
    const due = new Date(e.due_date);
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (24 * 3600 * 1000));
    const offset = REMINDER_OFFSETS.find((o) => daysLeft <= o);
    if (offset === undefined) continue;
    if (e.last_reminder_offset !== null && e.last_reminder_offset <= offset) continue;
    let to = process.env.ADMIN_EMAIL ?? null;
    if (e.applies_to_user_id) {
      const u = getUserById(e.applies_to_user_id);
      if (u) to = u.email;
    }
    if (!to) continue;
    sendNotification(
      `[Regulatory] ${e.title} — due in ${daysLeft} days`,
      `<p>The regulatory deadline <b>${e.title}</b> is due in ${daysLeft} days (${e.due_date}).</p>`,
      to,
    ).catch(() => undefined);
    db.prepare(`UPDATE regulatory_calendar_events SET last_reminder_offset = ? WHERE id = ?`).run(
      offset,
      e.id,
    );
    sent += 1;
  }
  if (sent) logger.info(`dispatched ${sent} regulatory reminders`);
  return { sent };
}

export function ensureSeededForAllLawyers(jurisdiction = 'NSW'): void {
  const db = getDatabase();
  for (const u of listUsers()) {
    if (u.role === 'admin' || u.role === 'lawyer') {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM regulatory_calendar_events WHERE applies_to_user_id = ?')
        .get(u.id) as { n: number };
      if (row.n === 0) seedEventsForUser(u, jurisdiction);
    }
  }
}
