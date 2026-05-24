/**
 * LEAP Legal integration.
 *
 * Optional. When the firm hasn't provided LEAP credentials the
 * integration short-circuits with `ok: true, configured: false` so
 * the rest of the system runs unchanged.
 *
 * Configuration (env):
 *   LEAP_BASE_URL        e.g. https://api.leap.app
 *   LEAP_CLIENT_ID
 *   LEAP_CLIENT_SECRET
 *   LEAP_ACCESS_TOKEN    Provisioned via the standard OAuth2 flow
 *                        out-of-band (the dashboard does not host
 *                        the OAuth callback — most firms paste the
 *                        token directly).
 *   LEAP_FIRM_ID         Optional firm id when the LEAP tenant maps
 *                        to multiple firms.
 *
 * Sync semantics (incremental):
 *   - Pull: GET /matters?updatedSince=<last-sync> — every LEAP matter
 *     that doesn't already exist locally is inserted with a sentinel
 *     "leap:<id>" intake_email_id so the dedupe is stable.
 *   - Push: every local matter created via Legal Overseer in the last
 *     window is POSTed to LEAP; the LEAP id is recorded in the local
 *     `key_value_store` table so re-runs are idempotent.
 *
 * Documents push (upload) is implemented as a stub that the firm can
 * enable per-matter — by default we don't push every document to LEAP
 * automatically.
 */

import { createSafeLogger } from '../../governance/index.js';
import { getDatabase } from '../../db/connection.js';
import { createMatter, getMatterByNumber, listMatters } from '../../db/repositories/matters.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import type { LeapConfig, LeapMatter, LeapSyncResult } from './types.js';

export type { LeapMatter, LeapSyncResult, LeapConfig } from './types.js';

const logger = createSafeLogger('LeapIntegration');

const SYNC_KEY = 'integrations.leap.last_sync';
const PUSH_LOG_PREFIX = 'integrations.leap.pushed.';

function readConfig(): LeapConfig | null {
  const baseUrl = process.env.LEAP_BASE_URL;
  const clientId = process.env.LEAP_CLIENT_ID;
  const clientSecret = process.env.LEAP_CLIENT_SECRET;
  const accessToken = process.env.LEAP_ACCESS_TOKEN;
  if (!baseUrl || !clientId || !clientSecret || !accessToken) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    clientId,
    clientSecret,
    accessToken,
    firmId: process.env.LEAP_FIRM_ID ?? null,
  };
}

export function isLeapConfigured(): boolean {
  return readConfig() !== null;
}

function kvGet(key: string): string | null {
  const db = getDatabase();
  try {
    const row = db.prepare(`SELECT value FROM key_value_store WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function kvSet(key: string, value: string): void {
  const db = getDatabase();
  try {
    db.prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
  } catch (err) {
    logger.warn(`kvSet failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function leapFetch(config: LeapConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.accessToken}`,
    accept: 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (config.firmId) headers['x-firm-id'] = config.firmId;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    return await fetch(url, { ...init, headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function pullMatters(config: LeapConfig, since: string | null): Promise<{ pulled: number; errors: string[] }> {
  const q = since ? `?updatedSince=${encodeURIComponent(since)}` : '';
  try {
    const res = await leapFetch(config, `/matters${q}`);
    if (!res.ok) {
      return { pulled: 0, errors: [`pull HTTP ${res.status}`] };
    }
    const body = await res.json() as { matters?: LeapMatter[] };
    const incoming = body.matters ?? [];
    let pulled = 0;
    for (const m of incoming) {
      const localKey = `LEAP-${m.matterNumber}`;
      if (getMatterByNumber(localKey)) continue;
      try {
        createMatter({
          matter_number: localKey,
          title: m.title,
          client_name: m.clientName,
          matter_type: 'unclassified',
          jurisdiction: process.env.DEFAULT_JURISDICTION ?? 'NSW',
          responsible_lawyer_email: m.responsibleLawyerEmail ?? null,
          intake_email_id: `leap:${m.id}`,
          notes: `Imported from LEAP (id=${m.id}) on ${new Date().toISOString()}`,
        });
        appendLegalAudit({
          matterId: null, actorId: 'integration:leap',
          action: 'leap.pull_matter',
          detail: `${m.matterNumber} (${m.id})`,
          refTable: 'matters', refId: null,
        });
        pulled += 1;
      } catch (err) {
        return { pulled, errors: [`pull insert: ${err instanceof Error ? err.message : String(err)}`] };
      }
    }
    return { pulled, errors: [] };
  } catch (err) {
    return { pulled: 0, errors: [`pull error: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

async function pushMatters(config: LeapConfig): Promise<{ pushed: number; errors: string[] }> {
  let pushed = 0;
  const errors: string[] = [];
  const local = listMatters().filter((m) => m.status === 'open' || m.status === 'on_hold');
  for (const m of local) {
    // Don't re-push matters that originated in LEAP.
    if (m.matter_number.startsWith('LEAP-')) continue;
    if (kvGet(`${PUSH_LOG_PREFIX}${m.id}`)) continue;
    try {
      const res = await leapFetch(config, '/matters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matterNumber: m.matter_number,
          title: m.title,
          clientName: m.client_name,
          responsibleLawyerEmail: m.responsible_lawyer_email,
          status: m.status,
        }),
      });
      if (!res.ok) {
        errors.push(`push ${m.matter_number}: HTTP ${res.status}`);
        continue;
      }
      const body = await res.json() as { id?: string };
      kvSet(`${PUSH_LOG_PREFIX}${m.id}`, body.id ?? 'pushed');
      appendLegalAudit({
        matterId: m.id, actorId: 'integration:leap',
        action: 'leap.push_matter',
        detail: `→ LEAP id ${body.id ?? '(unknown)'}`,
        refTable: 'matters', refId: m.id,
      });
      pushed += 1;
    } catch (err) {
      errors.push(`push ${m.matter_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { pushed, errors };
}

export interface SyncOptions {
  triggeredBy?: string;
  pullOnly?: boolean;
  pushOnly?: boolean;
}

export async function syncLeap(opts: SyncOptions = {}): Promise<LeapSyncResult> {
  const config = readConfig();
  if (!config) {
    logger.info('LEAP not configured — skipping sync');
    return { ok: true, configured: false, pulled: 0, pushed: 0, errors: [] };
  }
  const since = kvGet(SYNC_KEY);
  let pulled = 0;
  let pushed = 0;
  const errors: string[] = [];

  if (!opts.pushOnly) {
    const pr = await pullMatters(config, since);
    pulled = pr.pulled;
    errors.push(...pr.errors);
  }
  if (!opts.pullOnly) {
    const ps = await pushMatters(config);
    pushed = ps.pushed;
    errors.push(...ps.errors);
  }
  kvSet(SYNC_KEY, new Date().toISOString());

  appendLegalAudit({
    matterId: null, actorId: opts.triggeredBy ?? 'system',
    action: 'leap.sync_complete',
    detail: `pulled=${pulled} pushed=${pushed} errors=${errors.length}`,
    metadata: { pulled, pushed, errors },
  });
  logger.info(`leap sync done: pulled=${pulled} pushed=${pushed} errors=${errors.length}`);
  return { ok: errors.length === 0, configured: true, pulled, pushed, errors };
}
