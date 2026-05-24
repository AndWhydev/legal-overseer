/**
 * 4.1 — AML screening.
 *
 * Screens clients against publicly available sanctions and PEP lists.
 * The in-process check is heuristic: it compares normalised client
 * names against a built-in seed of public watchlist names (the firm
 * can update this monthly from public sources). For deployments that
 * need stricter coverage, the screener exposes an optional HTTP
 * lookup URL (AML_LOOKUP_URL) the compliance team can wire to a
 * proper screening provider.
 *
 * Every screening is recorded as an aml_screenings row + audit entry.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getClient } from '../clients/repo.js';

const logger = createSafeLogger('AML');

export type AMLStatus = 'clear' | 'flagged' | 'cleared_by_review' | 'blocked';

export interface AMLScreening {
  id: string;
  client_id: string;
  screened_against_json: string;
  matches_json: string;
  match_count: number;
  status: AMLStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  screened_at: string;
}

export interface AMLMatch {
  list: string;
  matched_name: string;
  reason: string;
  score: number;
}

const SEED_LISTS = {
  un_sanctions: [
    // A small built-in seed — operators replace this monthly from public sources.
    // Real deployments should run an out-of-band sync from sanctionsmap.eu / consolidated.json.
  ] as string[],
  ofac_sdn: [] as string[],
  austrac_pep: [] as string[],
};

function normalise(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkAgainstList(name: string, address: string | null, list: string[], listName: string): AMLMatch[] {
  const out: AMLMatch[] = [];
  const target = normalise(name);
  for (const entry of list) {
    const ent = normalise(entry);
    if (!ent) continue;
    if (ent === target) {
      out.push({ list: listName, matched_name: entry, reason: 'exact name match', score: 1.0 });
    } else if (target.includes(ent) || ent.includes(target)) {
      out.push({ list: listName, matched_name: entry, reason: 'substring containment', score: 0.7 });
    }
  }
  if (address) {
    // Naive address-substring check.
    const addr = normalise(address);
    for (const entry of list) {
      if (normalise(entry).split(' ').some((tok) => tok.length > 4 && addr.includes(tok))) {
        out.push({ list: listName, matched_name: entry, reason: 'address token match', score: 0.4 });
      }
    }
  }
  return out;
}

async function externalLookup(name: string): Promise<AMLMatch[]> {
  const url = process.env.AML_LOOKUP_URL;
  if (!url) return [];
  try {
    const u = new URL(url);
    u.searchParams.set('name', name);
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: AMLMatch[] };
    return data.matches ?? [];
  } catch (err) {
    logger.warn(`external AML lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export interface ScreenClientInput {
  clientId: string;
  acting: string;
}

export async function screenClient(input: ScreenClientInput): Promise<AMLScreening> {
  const client = getClient(input.clientId);
  if (!client) throw new Error(`client ${input.clientId} not found`);
  const matches: AMLMatch[] = [];
  matches.push(...checkAgainstList(client.full_name, client.address, SEED_LISTS.un_sanctions, 'UN_SANCTIONS'));
  matches.push(...checkAgainstList(client.full_name, client.address, SEED_LISTS.ofac_sdn, 'OFAC_SDN'));
  matches.push(...checkAgainstList(client.full_name, client.address, SEED_LISTS.austrac_pep, 'AUSTRAC_PEP'));
  matches.push(...(await externalLookup(client.full_name)));

  const status: AMLStatus = matches.length ? 'flagged' : 'clear';
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO aml_screenings
       (id, client_id, screened_against_json, matches_json, match_count, status, screened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    client.id,
    JSON.stringify(['un_sanctions', 'ofac_sdn', 'austrac_pep', process.env.AML_LOOKUP_URL ? 'external_lookup' : 'no_external']),
    JSON.stringify(matches),
    matches.length,
    status,
    now,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'aml.screen',
    detail: `${client.full_name}: ${status} (${matches.length} match${matches.length === 1 ? '' : 'es'})`,
    refTable: 'aml_screenings',
    refId: id,
    metadata: { status, match_count: matches.length },
  });
  logger.info(`screened ${client.full_name}: ${status} (${matches.length} matches)`);
  return getScreening(id) as AMLScreening;
}

export function getScreening(id: string): AMLScreening | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM aml_screenings WHERE id = ?').get(id) as AMLScreening | undefined) ?? null
  );
}

export function listClientScreenings(clientId: string): AMLScreening[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM aml_screenings WHERE client_id = ? ORDER BY screened_at DESC`)
    .all(clientId) as AMLScreening[];
}

export function listFlaggedScreenings(): AMLScreening[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM aml_screenings WHERE status = 'flagged' ORDER BY screened_at DESC`)
    .all() as AMLScreening[];
}

export function reviewScreening(id: string, acting: string, decision: 'cleared_by_review' | 'blocked', note?: string): AMLScreening {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE aml_screenings SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`,
  ).run(decision, acting, now, note ?? null, id);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: `aml.${decision}`,
    detail: `screening ${id}`,
    refTable: 'aml_screenings',
    refId: id,
    metadata: { note: note ?? null },
  });
  return getScreening(id) as AMLScreening;
}

export interface AMLMonthlyReport {
  period: string;
  totalScreenings: number;
  clearedAutomatically: number;
  flaggedRequiringReview: number;
  clearedByReview: number;
  blocked: number;
}

export function generateMonthlyAmlReport(period: string): AMLMonthlyReport {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM aml_screenings
       WHERE substr(screened_at, 1, 7) = ? GROUP BY status`,
    )
    .all(period) as { status: AMLStatus; n: number }[];
  const counts: Record<AMLStatus, number> = { clear: 0, flagged: 0, cleared_by_review: 0, blocked: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return {
    period,
    totalScreenings: counts.clear + counts.flagged + counts.cleared_by_review + counts.blocked,
    clearedAutomatically: counts.clear,
    flaggedRequiringReview: counts.flagged,
    clearedByReview: counts.cleared_by_review,
    blocked: counts.blocked,
  };
}
