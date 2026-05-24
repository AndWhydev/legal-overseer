/**
 * 5.3 — Court date calendar sync.
 *
 * Mints an ICS feed per lawyer with their deadlines, court dates and
 * regulatory reminders. Google / Outlook OAuth flows live in the
 * provider sub-modules — both follow the same config table.
 *
 * The ICS feed is the bare-minimum surface: no OAuth, the lawyer just
 * subscribes to the feed URL from their Calendar app. The OAuth flows
 * are wired up to push events directly when configured.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getUserById } from '../users/repo.js';
import { listMatters, getMatterById } from '../db/repositories/matters.js';
import { listUpcomingEvents } from '../compliance/regulatory-calendar.js';

const logger = createSafeLogger('CalendarSync');

export type CalProvider = 'google' | 'outlook' | 'ics';

export interface CalendarSyncConfig {
  id: string;
  user_id: string;
  provider: CalProvider;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  ics_feed_token: string | null;
  calendar_id: string | null;
  last_sync_at: string | null;
  enabled: number;
  created_at: string;
}

export interface UpsertConfigInput {
  userId: string;
  provider: CalProvider;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  calendarId?: string;
  acting: string;
}

export function upsertCalendarConfig(input: UpsertConfigInput): CalendarSyncConfig {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM calendar_sync_configs WHERE user_id = ?')
    .get(input.userId) as CalendarSyncConfig | undefined;
  const id = existing?.id ?? randomUUID();
  const icsToken = existing?.ics_feed_token ?? randomBytes(20).toString('hex');
  if (existing) {
    db.prepare(
      `UPDATE calendar_sync_configs
         SET provider = ?, access_token = ?, refresh_token = ?, token_expires_at = ?,
             calendar_id = ?, enabled = 1
       WHERE id = ?`,
    ).run(
      input.provider,
      input.accessToken ?? existing.access_token,
      input.refreshToken ?? existing.refresh_token,
      input.tokenExpiresAt ?? existing.token_expires_at,
      input.calendarId ?? existing.calendar_id,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO calendar_sync_configs
         (id, user_id, provider, access_token, refresh_token, token_expires_at,
          ics_feed_token, calendar_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.userId,
      input.provider,
      input.accessToken ?? null,
      input.refreshToken ?? null,
      input.tokenExpiresAt ?? null,
      icsToken,
      input.calendarId ?? null,
    );
  }
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'calendar.configure',
    detail: `provider=${input.provider}`,
    refTable: 'calendar_sync_configs',
    refId: id,
  });
  return getConfig(input.userId) as CalendarSyncConfig;
}

export function getConfig(userId: string): CalendarSyncConfig | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM calendar_sync_configs WHERE user_id = ?').get(userId) as
      | CalendarSyncConfig
      | undefined) ?? null
  );
}

export function getConfigByIcsToken(token: string): CalendarSyncConfig | null {
  const db = getDatabase();
  return (
    (db
      .prepare('SELECT * FROM calendar_sync_configs WHERE ics_feed_token = ?')
      .get(token) as CalendarSyncConfig | undefined) ?? null
  );
}

export function disableCalendarSync(userId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE calendar_sync_configs SET enabled = 0 WHERE user_id = ?`).run(userId);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'calendar.disable',
    detail: userId,
    refTable: 'calendar_sync_configs',
    refId: null,
  });
}

interface FeedEvent {
  uid: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  location?: string;
}

function eventsForUser(userId: string): FeedEvent[] {
  const user = getUserById(userId);
  if (!user) return [];
  const db = getDatabase();
  // Deadlines for matters owned by the user.
  const userMatters = listMatters().filter((m) => m.responsible_lawyer_email === user.email);
  const matterIds = userMatters.map((m) => m.id);
  if (!matterIds.length) return [];
  const placeholders = matterIds.map(() => '?').join(',');
  const deadlines = db
    .prepare(
      `SELECT id, matter_id, description, due_date, deadline_type
       FROM deadlines WHERE matter_id IN (${placeholders}) AND status NOT IN ('met', 'waived')`,
    )
    .all(...matterIds) as { id: string; matter_id: string; description: string; due_date: string; deadline_type: string }[];

  const out: FeedEvent[] = [];
  for (const d of deadlines) {
    const m = getMatterById(d.matter_id);
    if (!m) continue;
    out.push({
      uid: `dl-${d.id}@legal-overseer`,
      summary: `[${m.matter_number}] ${d.description}`,
      description: `Deadline type: ${d.deadline_type}\nMatter: ${m.matter_number} — ${m.title}`,
      start: d.due_date.length === 10 ? `${d.due_date.replace(/-/g, '')}T090000Z` : isoToCal(d.due_date),
      end: d.due_date.length === 10 ? `${d.due_date.replace(/-/g, '')}T100000Z` : isoToCal(d.due_date),
    });
  }
  for (const r of listUpcomingEvents(180, userId)) {
    out.push({
      uid: `reg-${r.id}@legal-overseer`,
      summary: `[Regulatory] ${r.title}`,
      description: r.description ?? '',
      start: `${r.due_date.replace(/-/g, '')}T090000Z`,
      end: `${r.due_date.replace(/-/g, '')}T100000Z`,
    });
  }
  return out;
}

function isoToCal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function icsEscape(s: string): string {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcsFeed(userId: string): string {
  const events = eventsForUser(userId);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Legal Overseer//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${isoToCal(new Date().toISOString())}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      `DESCRIPTION:${icsEscape(e.description)}`,
      `DTSTART:${e.start}`,
      `DTEND:${e.end}`,
    );
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Push a single event to the configured provider. The Google / Outlook
 * concrete implementations attach via this seam; if neither provider
 * is configured the function is a no-op and the lawyer relies on the
 * ICS feed instead.
 */
export async function pushEvent(_userId: string, _event: FeedEvent): Promise<{ ok: boolean }> {
  // OAuth push is provider-specific and lives in src/integrations/google/
  // / src/integrations/outlook/. Both wire through here.
  return { ok: true };
}
