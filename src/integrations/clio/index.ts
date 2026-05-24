/**
 * Clio integration.
 *
 * Optional. When the firm hasn't provided Clio credentials the
 * integration short-circuits with `ok: true, configured: false`.
 *
 * Configuration (env):
 *   CLIO_BASE_URL        e.g. https://app.clio.com/api/v4
 *                        Use the AU/EU URL for non-US deployments.
 *   CLIO_ACCESS_TOKEN    OAuth2 bearer token (provisioned out-of-band)
 *   CLIO_USER_ID         Optional — set when the token is firm-wide.
 *
 * Wire format mirrors the LEAP module: pull matters since the last
 * sync timestamp, push local-originated matters, record dedupe state
 * in key_value_store.
 */

import { createSafeLogger } from '../../governance/index.js';
import { getDatabase } from '../../db/connection.js';
import { createMatter, getMatterByNumber, listMatters } from '../../db/repositories/matters.js';
import { appendLegalAudit } from '../../compliance/audit.js';

const logger = createSafeLogger('ClioIntegration');

export interface ClioMatter {
  id: number | string;
  number: string;
  description: string;
  client: { name: string };
  status: string;
  responsible_attorney?: { email?: string };
  updated_at: string;
}

export interface ClioSyncResult {
  ok: boolean;
  configured: boolean;
  pulled: number;
  pushed: number;
  errors: string[];
}

interface ClioConfig {
  baseUrl: string;
  accessToken: string;
  userId: string | null;
}

const SYNC_KEY = 'integrations.clio.last_sync';
const PUSH_LOG_PREFIX = 'integrations.clio.pushed.';

function readConfig(): ClioConfig | null {
  const baseUrl = process.env.CLIO_BASE_URL;
  const accessToken = process.env.CLIO_ACCESS_TOKEN;
  if (!baseUrl || !accessToken) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    accessToken,
    userId: process.env.CLIO_USER_ID ?? null,
  };
}

export function isClioConfigured(): boolean {
  return readConfig() !== null;
}

function kvGet(key: string): string | null {
  const db = getDatabase();
  try {
    const row = db.prepare(`SELECT value FROM key_value_store WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch { return null; }
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

async function clioFetch(config: ClioConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.accessToken}`,
    accept: 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    return await fetch(url, { ...init, headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function pullMatters(config: ClioConfig, since: string | null): Promise<{ pulled: number; errors: string[] }> {
  const q = since ? `?updated_since=${encodeURIComponent(since)}` : '';
  try {
    const res = await clioFetch(config, `/matters${q}`);
    if (!res.ok) return { pulled: 0, errors: [`pull HTTP ${res.status}`] };
    const body = await res.json() as { data?: ClioMatter[] };
    let pulled = 0;
    for (const m of body.data ?? []) {
      const localKey = `CLIO-${m.number}`;
      if (getMatterByNumber(localKey)) continue;
      try {
        createMatter({
          matter_number: localKey,
          title: m.description || `Clio matter ${m.number}`,
          client_name: m.client?.name ?? 'Unknown',
          matter_type: 'unclassified',
          jurisdiction: process.env.DEFAULT_JURISDICTION ?? 'NSW',
          responsible_lawyer_email: m.responsible_attorney?.email ?? null,
          intake_email_id: `clio:${m.id}`,
          notes: `Imported from Clio (id=${m.id}) on ${new Date().toISOString()}`,
        });
        appendLegalAudit({
          matterId: null, actorId: 'integration:clio',
          action: 'clio.pull_matter',
          detail: `${m.number} (${m.id})`,
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

async function pushMatters(config: ClioConfig): Promise<{ pushed: number; errors: string[] }> {
  let pushed = 0;
  const errors: string[] = [];
  for (const m of listMatters()) {
    if (m.status !== 'open' && m.status !== 'on_hold') continue;
    if (m.matter_number.startsWith('CLIO-')) continue;
    if (kvGet(`${PUSH_LOG_PREFIX}${m.id}`)) continue;
    try {
      const res = await clioFetch(config, '/matters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data: {
            number: m.matter_number,
            description: m.title,
            client: { name: m.client_name },
            status: m.status === 'open' ? 'Open' : 'Pending',
            responsible_attorney: m.responsible_lawyer_email ? { email: m.responsible_lawyer_email } : undefined,
          },
        }),
      });
      if (!res.ok) { errors.push(`push ${m.matter_number}: HTTP ${res.status}`); continue; }
      const body = await res.json() as { data?: { id: number } };
      kvSet(`${PUSH_LOG_PREFIX}${m.id}`, String(body.data?.id ?? 'pushed'));
      appendLegalAudit({
        matterId: m.id, actorId: 'integration:clio',
        action: 'clio.push_matter',
        detail: `→ Clio id ${body.data?.id ?? '(unknown)'}`,
        refTable: 'matters', refId: m.id,
      });
      pushed += 1;
    } catch (err) {
      errors.push(`push ${m.matter_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { pushed, errors };
}

export interface ClioSyncOptions {
  triggeredBy?: string;
  pullOnly?: boolean;
  pushOnly?: boolean;
}

export async function syncClio(opts: ClioSyncOptions = {}): Promise<ClioSyncResult> {
  const config = readConfig();
  if (!config) {
    logger.info('Clio not configured — skipping sync');
    return { ok: true, configured: false, pulled: 0, pushed: 0, errors: [] };
  }
  const since = kvGet(SYNC_KEY);
  let pulled = 0; let pushed = 0; const errors: string[] = [];

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
    action: 'clio.sync_complete',
    detail: `pulled=${pulled} pushed=${pushed} errors=${errors.length}`,
    metadata: { pulled, pushed, errors },
  });
  logger.info(`clio sync done: pulled=${pulled} pushed=${pushed} errors=${errors.length}`);
  return { ok: errors.length === 0, configured: true, pulled, pushed, errors };
}
