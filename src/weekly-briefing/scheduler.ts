/**
 * Weekly intelligence briefing scheduler.
 *
 * Cron: Monday 08:00 local time (override with WEEKLY_BRIEFING_CRON).
 * Walks every active lawyer / admin, builds a personalised HTML body
 * driven by their briefing_preferences, and emails it.
 */

import cron from 'node-cron';
import { createSafeLogger } from '../governance/index.js';
import { getDatabase } from '../db/connection.js';
import { isEmailConfigured, sendNotification } from '../email/notifier.js';
import { listMatters, type Matter } from '../db/repositories/matters.js';
import { listUpcoming, type Deadline } from '../db/repositories/deadlines.js';
import { getBriefingPreferences } from './prefs.js';

const logger = createSafeLogger('WeeklyBriefing');

export const WEEKLY_BRIEFING_CRON = '0 8 * * 1';
type ScheduledTask = ReturnType<typeof cron.schedule>;
let scheduled: ScheduledTask | null = null;

export interface WeeklyBriefing {
  email: string;
  fullName: string;
  generatedAt: string;
  matters: Matter[];
  thisWeekDeadlines: Deadline[];
  overdue: Deadline[];
  regulatory: Array<{ id: string; title: string; summary: string }>;
  newPrecedents: Array<{ id: string; title: string; category: string }>;
}

export interface WeeklyBriefingResult {
  total: number;
  sent: number;
  skipped: number;
  errors: string[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function withinNextWeek(d: Deadline, now: Date = new Date()): boolean {
  const due = Date.parse(d.due_date);
  return due - now.getTime() >= 0 && due - now.getTime() <= 7 * 86400000;
}

function isOverdue(d: Deadline, now: Date = new Date()): boolean {
  if (d.status !== 'open' && d.status !== 'reminded') return false;
  return Date.parse(d.due_date) < now.getTime();
}

function listActiveLawyers(): Array<{ id: string; email: string; full_name: string }> {
  const db = getDatabase();
  return db.prepare(
    `SELECT id, email, full_name FROM users
     WHERE status = 'active' AND role IN ('admin', 'lawyer')
     ORDER BY email`,
  ).all() as Array<{ id: string; email: string; full_name: string }>;
}

function listRecentRegulatoryAlerts(): Array<{ id: string; title: string; summary: string }> {
  const db = getDatabase();
  // Compliance Monitor outputs land in review_queue with output_kind='regulatory_alert'.
  try {
    const rows = db.prepare(
      `SELECT id, title, body_markdown FROM review_queue
       WHERE output_kind = 'regulatory_alert'
         AND created_at >= datetime('now', '-7 days')
       ORDER BY created_at DESC LIMIT 5`,
    ).all() as Array<{ id: string; title: string; body_markdown: string }>;
    return rows.map((r) => ({
      id: r.id, title: r.title,
      summary: (r.body_markdown || '').replace(/[#*_`]/g, '').slice(0, 240),
    }));
  } catch { return []; }
}

function listNewPrecedents(): Array<{ id: string; title: string; category: string }> {
  const db = getDatabase();
  try {
    return db.prepare(
      `SELECT id, title, category FROM precedents
       WHERE created_at >= datetime('now', '-7 days')
       ORDER BY created_at DESC LIMIT 10`,
    ).all() as Array<{ id: string; title: string; category: string }>;
  } catch { return []; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDeadline(d: Deadline, matterLookup: Map<string, Matter>): string {
  const m = matterLookup.get(d.matter_id);
  const ref = m ? `${m.matter_number} ${m.title}` : '—';
  return `<li><b>${d.due_date}</b> — ${escapeHtml(d.description)} <span style="color:#666">[${d.deadline_type}, ${escapeHtml(ref)}]</span></li>`;
}

export function buildWeeklyBriefingHtml(b: WeeklyBriefing, prefs: ReturnType<typeof getBriefingPreferences>): string {
  const matterLookup = new Map(b.matters.map((m) => [m.id, m]));

  const sections: string[] = [];
  sections.push(`<h1>Weekly Brief — ${escapeHtml(b.fullName)}</h1>`);
  sections.push(`<p style="color:#666">Generated ${b.generatedAt}</p>`);

  if (prefs.section_matters) {
    sections.push(`<h2>Your active matters (${b.matters.length})</h2>`);
    if (b.matters.length) {
      sections.push('<ul>' + b.matters.map((m) =>
        `<li><b>${escapeHtml(m.matter_number)}</b> — ${escapeHtml(m.title)} <span style="color:#666">[${escapeHtml(m.client_name)}, ${escapeHtml(m.matter_type)}]</span></li>`,
      ).join('') + '</ul>');
    } else {
      sections.push('<p>No active matters assigned.</p>');
    }
  }

  if (prefs.section_deadlines) {
    sections.push(`<h2>Upcoming deadlines this week (${b.thisWeekDeadlines.length})</h2>`);
    sections.push(b.thisWeekDeadlines.length
      ? '<ul>' + b.thisWeekDeadlines.map((d) => fmtDeadline(d, matterLookup)).join('') + '</ul>'
      : '<p>None.</p>');
  }

  if (prefs.section_overdue) {
    sections.push(`<h2>Overdue items (${b.overdue.length})</h2>`);
    sections.push(b.overdue.length
      ? '<ul>' + b.overdue.map((d) => fmtDeadline(d, matterLookup)).join('') + '</ul>'
      : '<p>Nothing overdue.</p>');
  }

  if (prefs.section_regulatory) {
    sections.push(`<h2>Regulatory changes detected (${b.regulatory.length})</h2>`);
    sections.push(b.regulatory.length
      ? '<ul>' + b.regulatory.map((r) => `<li><b>${escapeHtml(r.title)}</b> — ${escapeHtml(r.summary)}</li>`).join('') + '</ul>'
      : '<p>None this week.</p>');
  }

  if (prefs.section_precedents) {
    sections.push(`<h2>New precedents added (${b.newPrecedents.length})</h2>`);
    sections.push(b.newPrecedents.length
      ? '<ul>' + b.newPrecedents.map((p) => `<li>${escapeHtml(p.title)} <span style="color:#666">[${escapeHtml(p.category)}]</span></li>`).join('') + '</ul>'
      : '<p>No precedents added in the last 7 days.</p>');
  }

  sections.push(`<hr><p style="color:#888;font-size:12px">Briefing automated by Legal Overseer. Adjust your sections at /me/briefing or opt out entirely from the same page.</p>`);

  return sections.join('\n');
}

export async function runWeeklyBriefingSweep(now: Date = new Date()): Promise<WeeklyBriefingResult> {
  const lawyers = listActiveLawyers();
  const allMatters = listMatters();
  const upcomingAll = listUpcoming(30);
  const regulatory = listRecentRegulatoryAlerts();
  const newPrecedents = listNewPrecedents();
  const result: WeeklyBriefingResult = { total: lawyers.length, sent: 0, skipped: 0, errors: [] };

  void todayIso;

  if (!isEmailConfigured()) {
    logger.warn('SMTP not configured; weekly briefings will not be emailed.');
  }

  for (const lawyer of lawyers) {
    const prefs = getBriefingPreferences(lawyer.id);
    if (!prefs.weekly_enabled) { result.skipped += 1; continue; }

    const lawyerMatters = allMatters.filter((m) =>
      m.responsible_lawyer_email && m.responsible_lawyer_email.toLowerCase() === lawyer.email.toLowerCase()
      && (m.status === 'open' || m.status === 'on_hold'),
    );
    const matterIds = new Set(lawyerMatters.map((m) => m.id));
    const lawyerDeadlines = upcomingAll.filter((d) => matterIds.has(d.matter_id));

    const briefing: WeeklyBriefing = {
      email: lawyer.email,
      fullName: lawyer.full_name,
      generatedAt: now.toISOString(),
      matters: lawyerMatters,
      thisWeekDeadlines: lawyerDeadlines.filter((d) => withinNextWeek(d, now)),
      overdue: lawyerDeadlines.filter((d) => isOverdue(d, now)),
      regulatory,
      newPrecedents,
    };

    const html = buildWeeklyBriefingHtml(briefing, prefs);
    try {
      await sendNotification('Weekly Brief — Legal Overseer', html, lawyer.email);
      result.sent += 1;
    } catch (err) {
      result.errors.push(`${lawyer.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logger.info(`weekly briefing sweep: total=${result.total} sent=${result.sent} skipped=${result.skipped}`);
  return result;
}

export function initWeeklyBriefingScheduler(): void {
  if (process.env.WEEKLY_BRIEFING_DISABLED === 'true') {
    logger.info('Disabled (WEEKLY_BRIEFING_DISABLED=true)');
    return;
  }
  if (scheduled) return;
  const expr = process.env.WEEKLY_BRIEFING_CRON || WEEKLY_BRIEFING_CRON;
  scheduled = cron.schedule(expr, () => {
    runWeeklyBriefingSweep().catch((err) =>
      logger.error(`weekly briefing sweep failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  });
  logger.info(`Weekly briefing scheduler started (cron: ${expr})`);
}

export function stopWeeklyBriefingScheduler(): void {
  if (scheduled) {
    scheduled.stop();
    scheduled = null;
    logger.info('Weekly briefing scheduler stopped');
  }
}
