/**
 * Immutable legal audit trail.
 *
 * Every action a skill, reviewer, or system process takes against a
 * matter is appended to legal_audit_log. Rows are INSERT-only —
 * there's no UPDATE / DELETE path through this module, and the
 * underlying table has no trigger that allows it. A separate row
 * carries the chain hash so the operator can later detect any
 * out-of-band tampering.
 *
 * Each row stores:
 *   - actor (human email or "skill:<id>" or "system")
 *   - action (a short event slug like "matter.create", "review.approve")
 *   - free-form detail
 *   - the model used (when an AI action — sourced from the task)
 *   - the prior row's hash (chain integrity)
 *   - this row's hash (sha256 of canonical-encoded row content)
 *
 * Hard product constraint: this log is the source of truth for any
 * later regulator or insurer review. Adding or removing fields here
 * MUST go through a migration; never mutate existing rows.
 */

import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';

export interface LegalAuditEntry {
  id: string;
  matter_id: string | null;
  actor_id: string;
  action: string;
  detail: string | null;
  ref_table: string | null;
  ref_id: string | null;
  model_used: string | null;
  metadata_json: string | null;
  prev_hash: string | null;
  row_hash: string;
  created_at: string;
}

export interface AppendLegalAuditInput {
  matterId: string | null;
  actorId: string;
  action: string;
  detail?: string | null;
  refTable?: string | null;
  refId?: string | null;
  modelUsed?: string | null;
  metadata?: Record<string, unknown> | null;
}

function hashRow(parts: {
  id: string;
  matter_id: string | null;
  actor_id: string;
  action: string;
  detail: string | null;
  ref_table: string | null;
  ref_id: string | null;
  model_used: string | null;
  metadata_json: string | null;
  prev_hash: string | null;
  created_at: string;
}): string {
  const canonical = JSON.stringify([
    parts.id,
    parts.matter_id ?? '',
    parts.actor_id,
    parts.action,
    parts.detail ?? '',
    parts.ref_table ?? '',
    parts.ref_id ?? '',
    parts.model_used ?? '',
    parts.metadata_json ?? '',
    parts.prev_hash ?? '',
    parts.created_at,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

function getLastHash(): string | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT row_hash FROM legal_audit_log ORDER BY rowid DESC LIMIT 1`)
    .get() as { row_hash: string } | undefined;
  return row?.row_hash ?? null;
}

/**
 * Append a single audit entry to the immutable log. Returns the
 * inserted row.
 */
export function appendLegalAudit(input: AppendLegalAuditInput): LegalAuditEntry {
  const db = getDatabase();
  const id = randomUUID();
  const created_at = new Date().toISOString();
  const prev_hash = getLastHash();
  const metadata_json = input.metadata ? JSON.stringify(input.metadata) : null;

  const parts = {
    id,
    matter_id: input.matterId,
    actor_id: input.actorId,
    action: input.action,
    detail: input.detail ?? null,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    model_used: input.modelUsed ?? null,
    metadata_json,
    prev_hash,
    created_at,
  };
  const row_hash = hashRow(parts);

  db.prepare(
    `
    INSERT INTO legal_audit_log (
      id, matter_id, actor_id, action, detail, ref_table, ref_id,
      model_used, metadata_json, prev_hash, row_hash, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    parts.matter_id,
    parts.actor_id,
    parts.action,
    parts.detail,
    parts.ref_table,
    parts.ref_id,
    parts.model_used,
    parts.metadata_json,
    parts.prev_hash,
    row_hash,
    parts.created_at,
  );

  return { ...parts, row_hash } as LegalAuditEntry;
}

export function listAuditForMatter(matterId: string, limit = 500): LegalAuditEntry[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM legal_audit_log WHERE matter_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(matterId, limit) as LegalAuditEntry[];
}

export function listRecentAudit(limit = 200): LegalAuditEntry[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM legal_audit_log ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as LegalAuditEntry[];
}

/**
 * Verify the chain integrity of the audit log. Walks every row from
 * oldest to newest, recomputing each row_hash and checking it matches
 * the stored hash, and that each row's prev_hash matches the prior
 * row's row_hash. Returns null on success or a description of the
 * first inconsistency.
 *
 * Run by the dashboard health check + nightly via the briefing.
 */
export function verifyAuditChain(): { ok: true } | { ok: false; firstBreak: string } {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT * FROM legal_audit_log ORDER BY rowid ASC`)
    .all() as LegalAuditEntry[];

  let prev: string | null = null;
  for (const r of rows) {
    if (r.prev_hash !== prev) {
      return { ok: false, firstBreak: `row ${r.id} prev_hash mismatch (expected ${prev}, got ${r.prev_hash})` };
    }
    const recomputed = hashRow({
      id: r.id,
      matter_id: r.matter_id,
      actor_id: r.actor_id,
      action: r.action,
      detail: r.detail,
      ref_table: r.ref_table,
      ref_id: r.ref_id,
      model_used: r.model_used,
      metadata_json: r.metadata_json,
      prev_hash: r.prev_hash,
      created_at: r.created_at,
    });
    if (recomputed !== r.row_hash) {
      return { ok: false, firstBreak: `row ${r.id} row_hash mismatch (recomputed ${recomputed}, stored ${r.row_hash})` };
    }
    prev = r.row_hash;
  }
  return { ok: true };
}
