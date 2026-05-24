/**
 * Conflict of interest checker.
 *
 * Hard product rule: when a new matter is created, the system MUST run
 * an automatic conflict check against every other matter in the firm
 * BEFORE the matter is allowed to proceed past intake. Any match is
 * surfaced to a lawyer who must explicitly clear (or override) it.
 *
 * Match logic (intentionally conservative — favours false positives):
 *
 *   1. Client name match — fuzzy match of normalised client_name
 *      against client_name AND opposing_party of every existing matter.
 *   2. Opposing-party match — same in reverse, so a former opponent
 *      becoming a new client surfaces too.
 *   3. Client-email same-domain (when both have an email).
 *   4. Substring containment (one name contained inside the other).
 *
 * The check creates a `conflict_checks` row with the match list. The
 * intake pipeline then writes a legal_audit_log entry. The matter is
 * not blocked at the database layer — the audit/compliance dashboard
 * surface highlights it and the intake auto-reply is held back until
 * a lawyer clears the check.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getMatterById, type Matter } from '../db/repositories/matters.js';

const logger = createSafeLogger('Conflicts');

export interface ConflictMatch {
  matter_id: string;
  matter_number: string;
  title: string;
  client_name: string;
  opposing_party: string | null;
  /** Which field on the new matter triggered the match. */
  triggered_by: 'client_name' | 'opposing_party' | 'client_email_domain' | 'substring';
  /** Which field on the existing matter matched. */
  matched_field: 'client_name' | 'opposing_party' | 'client_email';
  /** 0..1 score (higher = stronger match). */
  score: number;
  /** Free-text explanation. */
  reason: string;
}

export interface ConflictCheck {
  id: string;
  matter_id: string;
  ran_at: string;
  status: 'pending' | 'cleared' | 'blocked' | 'override';
  match_count: number;
  matches: ConflictMatch[];
  cleared_by: string | null;
  cleared_at: string | null;
  cleared_note: string | null;
}

function normalise(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\b(pty|ltd|inc|llc|llp|p\.?l\.?|limited|incorporated)\b\.?/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalise(s).split(' ').filter((t) => t.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}

interface PartyCandidate {
  value: string;
  field: 'client_name' | 'opposing_party';
}

function partyCandidates(m: Matter): PartyCandidate[] {
  const out: PartyCandidate[] = [];
  if (m.client_name) out.push({ value: m.client_name, field: 'client_name' });
  if (m.opposing_party) out.push({ value: m.opposing_party, field: 'opposing_party' });
  return out;
}

function compareParty(
  newField: 'client_name' | 'opposing_party',
  newValue: string,
  existing: Matter,
): ConflictMatch | null {
  const newToks = tokens(newValue);
  if (!newToks.size) return null;
  let best: ConflictMatch | null = null;
  for (const cand of partyCandidates(existing)) {
    const sim = jaccard(newToks, tokens(cand.value));
    const norm = { a: normalise(newValue), b: normalise(cand.value) };
    let score = sim;
    let triggered_by: ConflictMatch['triggered_by'] = newField === 'client_name' ? 'client_name' : 'opposing_party';
    let reason = `Token similarity ${Math.round(sim * 100)}% between "${newValue}" and ${cand.field} "${cand.value}".`;
    if (norm.a && norm.b && (norm.a.includes(norm.b) || norm.b.includes(norm.a))) {
      score = Math.max(score, 0.85);
      triggered_by = 'substring';
      reason = `Substring containment between "${newValue}" and ${cand.field} "${cand.value}".`;
    }
    if (score < 0.5) continue;
    const match: ConflictMatch = {
      matter_id: existing.id,
      matter_number: existing.matter_number,
      title: existing.title,
      client_name: existing.client_name,
      opposing_party: existing.opposing_party,
      triggered_by,
      matched_field: cand.field,
      score,
      reason,
    };
    if (!best || match.score > best.score) best = match;
  }
  return best;
}

export interface ConflictCheckInput {
  matterId: string;
  newClientName: string;
  newClientEmail?: string | null;
  newOpposingParty?: string | null;
}

export function runConflictCheck(input: ConflictCheckInput): ConflictCheck {
  const db = getDatabase();
  const allOther = db
    .prepare(`SELECT * FROM matters WHERE id <> ? AND status <> 'archived'`)
    .all(input.matterId) as Matter[];

  const newClientDomain = emailDomain(input.newClientEmail ?? null);
  const matches: ConflictMatch[] = [];

  for (const existing of allOther) {
    let best = compareParty('client_name', input.newClientName, existing);
    if (input.newOpposingParty) {
      const candidate = compareParty('opposing_party', input.newOpposingParty, existing);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    }
    // Email-domain match against the existing matter's client_email.
    if (!best && newClientDomain) {
      const existingDomain = emailDomain(existing.client_email ?? null);
      if (existingDomain && existingDomain === newClientDomain) {
        best = {
          matter_id: existing.id,
          matter_number: existing.matter_number,
          title: existing.title,
          client_name: existing.client_name,
          opposing_party: existing.opposing_party,
          triggered_by: 'client_email_domain',
          matched_field: 'client_email',
          score: 0.4,
          reason: `Both clients share email domain "${existingDomain}".`,
        };
      }
    }
    if (best) matches.push(best);
  }

  matches.sort((a, b) => b.score - a.score);

  const id = randomUUID();
  const now = new Date().toISOString();
  const status: ConflictCheck['status'] = matches.length ? 'pending' : 'cleared';
  db.prepare(
    `INSERT INTO conflict_checks
       (id, matter_id, ran_at, status, match_count, matches_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.matterId, now, status, matches.length, JSON.stringify(matches));

  appendLegalAudit({
    matterId: input.matterId,
    actorId: 'conflict-checker',
    action: 'conflict.check',
    detail: matches.length
      ? `Found ${matches.length} potential conflict(s); requires lawyer review.`
      : 'No conflicts detected.',
    refTable: 'conflict_checks', refId: id,
    metadata: { match_count: matches.length },
  });

  logger.info(`conflict check for matter ${input.matterId}: ${matches.length} match(es)`);
  return getConflictCheckById(id) as ConflictCheck;
}

function rowToConflictCheck(row: {
  id: string; matter_id: string; ran_at: string; status: ConflictCheck['status'];
  match_count: number; matches_json: string | null;
  cleared_by: string | null; cleared_at: string | null; cleared_note: string | null;
}): ConflictCheck {
  let matches: ConflictMatch[] = [];
  if (row.matches_json) {
    try { matches = JSON.parse(row.matches_json) as ConflictMatch[]; }
    catch { /* ignore */ }
  }
  return {
    id: row.id,
    matter_id: row.matter_id,
    ran_at: row.ran_at,
    status: row.status,
    match_count: row.match_count,
    matches,
    cleared_by: row.cleared_by,
    cleared_at: row.cleared_at,
    cleared_note: row.cleared_note,
  };
}

export function getConflictCheckById(id: string): ConflictCheck | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM conflict_checks WHERE id = ?').get(id) as Parameters<typeof rowToConflictCheck>[0] | undefined;
  return row ? rowToConflictCheck(row) : null;
}

export function getConflictCheckForMatter(matterId: string): ConflictCheck | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM conflict_checks WHERE matter_id = ? ORDER BY ran_at DESC LIMIT 1')
    .get(matterId) as Parameters<typeof rowToConflictCheck>[0] | undefined;
  return row ? rowToConflictCheck(row) : null;
}

export function listPendingConflictChecks(): ConflictCheck[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT * FROM conflict_checks WHERE status = 'pending' ORDER BY ran_at ASC`)
    .all() as Parameters<typeof rowToConflictCheck>[0][];
  return rows.map(rowToConflictCheck);
}

export interface ResolveConflictInput {
  conflictId: string;
  by: string;
  decision: 'cleared' | 'blocked' | 'override';
  note?: string;
}

export function resolveConflictCheck(input: ResolveConflictInput): ConflictCheck {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE conflict_checks
     SET status = ?, cleared_by = ?, cleared_at = ?, cleared_note = ?
     WHERE id = ?`,
  ).run(input.decision, input.by, now, input.note ?? null, input.conflictId);

  const fresh = getConflictCheckById(input.conflictId);
  if (!fresh) throw new Error(`conflict check ${input.conflictId} disappeared`);
  appendLegalAudit({
    matterId: fresh.matter_id,
    actorId: input.by,
    action: `conflict.${input.decision}`,
    detail: input.note ?? null,
    refTable: 'conflict_checks', refId: input.conflictId,
  });
  return fresh;
}

/**
 * Convenience predicate: is the matter blocked from outbound action
 * because of a pending conflict check? Outbound channels (intake
 * auto-reply, SMTP send) call this and skip if true.
 */
export function isMatterBlockedByConflict(matterId: string): boolean {
  const c = getConflictCheckForMatter(matterId);
  if (!c) return false;
  return c.status === 'pending' || c.status === 'blocked';
}

// Used in audit logs; exported for testing.
export { getMatterById };
