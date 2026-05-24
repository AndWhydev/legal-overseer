/**
 * 7.3 — Microsoft Teams notifications.
 *
 * Webhook-based. Configured by writing a Teams Incoming Webhook URL
 * into integration_configs (provider='teams'). Events: new matter,
 * review queue item, deadline reminder, conflict detected, high-risk
 * matter flagged.
 *
 * Sends adaptive cards for approval-required events with approve /
 * reject actions that POST back to the dashboard.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createSafeLogger } from '../../governance/index.js';
import { appendLegalAudit } from '../../compliance/audit.js';

const logger = createSafeLogger('Teams');

interface TeamsConfig {
  webhookUrl: string;
  events: string[];
  dashboardBaseUrl?: string;
}

function getConfig(): TeamsConfig | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT config_json FROM integration_configs WHERE provider = 'teams' AND enabled = 1`)
    .get() as { config_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.config_json) as TeamsConfig;
  } catch {
    return null;
  }
}

export function saveTeamsConfig(config: TeamsConfig, acting: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO integration_configs (id, provider, config_json, enabled, updated_at)
     VALUES (COALESCE((SELECT id FROM integration_configs WHERE provider = 'teams'), ?), 'teams', ?, 1, ?)`,
  ).run(randomUUID(), JSON.stringify(config), new Date().toISOString());
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'teams.configure',
    detail: 'webhook configured',
    refTable: 'integration_configs',
    refId: null,
  });
}

export function isTeamsConfigured(): boolean {
  return getConfig() !== null;
}

export interface NotifyTeamsInput {
  eventKind: string;
  title: string;
  body: string;
  refTable?: string;
  refId?: string;
  approveUrl?: string;
  rejectUrl?: string;
}

interface AdaptiveCardAction {
  type: string;
  title: string;
  url?: string;
}

export async function notifyTeams(input: NotifyTeamsInput): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig();
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  if (!config || !config.events.includes(input.eventKind)) {
    db.prepare(
      `INSERT INTO teams_notifications (id, event_kind, ref_table, ref_id, payload_json, delivery_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(id, input.eventKind, input.refTable ?? null, input.refId ?? null, JSON.stringify(input), now);
    return { ok: false, error: 'teams not configured or event not subscribed' };
  }

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.3',
          body: [
            { type: 'TextBlock', text: input.title, weight: 'Bolder', size: 'Medium' },
            { type: 'TextBlock', text: input.body, wrap: true },
          ],
          actions: ([
            input.approveUrl ? { type: 'Action.OpenUrl', title: 'Approve', url: input.approveUrl } : null,
            input.rejectUrl ? { type: 'Action.OpenUrl', title: 'Reject', url: input.rejectUrl } : null,
          ].filter(Boolean) as AdaptiveCardAction[]),
        },
      },
    ],
  };

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(card),
    });
    const ok = res.ok;
    db.prepare(
      `INSERT INTO teams_notifications (id, event_kind, ref_table, ref_id, payload_json, delivery_status, sent_at, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.eventKind,
      input.refTable ?? null,
      input.refId ?? null,
      JSON.stringify(input),
      ok ? 'sent' : 'failed',
      ok ? now : null,
      ok ? null : `HTTP ${res.status}`,
      now,
    );
    if (!ok) logger.warn(`teams notify HTTP ${res.status}`);
    return { ok, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      `INSERT INTO teams_notifications (id, event_kind, ref_table, ref_id, payload_json, delivery_status, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
    ).run(id, input.eventKind, input.refTable ?? null, input.refId ?? null, JSON.stringify(input), msg, now);
    return { ok: false, error: msg };
  }
}

export function listRecentTeamsNotifications(limit = 100): {
  id: string;
  event_kind: string;
  delivery_status: string;
  created_at: string;
  ref_id: string | null;
}[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, event_kind, delivery_status, created_at, ref_id
       FROM teams_notifications ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    event_kind: string;
    delivery_status: string;
    created_at: string;
    ref_id: string | null;
  }[];
}
