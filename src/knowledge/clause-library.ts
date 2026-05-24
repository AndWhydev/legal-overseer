/**
 * 2.5 — Clause library.
 *
 * Approved contract clauses organised by clause type, practice area
 * and jurisdiction. Drafting agents pick the best-matching clause and
 * insert the approved text rather than drafting from scratch.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';

const logger = createSafeLogger('ClauseLib');

export type RiskProfile = 'low' | 'medium' | 'high';

export interface Clause {
  id: string;
  slug: string;
  title: string;
  clause_type: string;
  practice_area: string | null;
  jurisdiction: string | null;
  risk_profile: RiskProfile | null;
  approved_text: string;
  usage_notes: string | null;
  alternatives_json: string | null;
  usage_count: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || randomUUID().slice(0, 8);
}

export interface AddClauseInput {
  title: string;
  clause_type: string;
  practice_area?: string;
  jurisdiction?: string;
  risk_profile?: RiskProfile;
  approved_text: string;
  usage_notes?: string;
  alternatives?: { label: string; text: string }[];
  approved_by: string;
}

export function addClause(input: AddClauseInput): Clause {
  const db = getDatabase();
  const id = randomUUID();
  const slug = slugify(`${input.clause_type}-${input.title}`);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clauses
       (id, slug, title, clause_type, practice_area, jurisdiction,
        risk_profile, approved_text, usage_notes, alternatives_json,
        usage_count, approved_by, approved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(
    id,
    slug,
    input.title,
    input.clause_type,
    input.practice_area ?? null,
    input.jurisdiction ?? null,
    input.risk_profile ?? null,
    input.approved_text,
    input.usage_notes ?? null,
    input.alternatives ? JSON.stringify(input.alternatives) : null,
    input.approved_by,
    now,
    now,
    now,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.approved_by,
    action: 'clause.add',
    detail: `${input.clause_type}: ${input.title}`,
    refTable: 'clauses',
    refId: id,
  });
  logger.info(`added clause "${input.title}" (${input.clause_type})`);
  return getClause(id) as Clause;
}

export function getClause(id: string): Clause | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM clauses WHERE id = ?').get(id) as Clause | undefined) ?? null;
}

export function getClauseBySlug(slug: string): Clause | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM clauses WHERE slug = ?').get(slug) as Clause | undefined) ?? null;
}

export interface ClauseSearchInput {
  clauseType?: string;
  practiceArea?: string;
  jurisdiction?: string;
  riskProfile?: RiskProfile;
  text?: string;
  limit?: number;
}

export function searchClauses(input: ClauseSearchInput): Clause[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (input.clauseType) {
    clauses.push('clause_type = ?');
    params.push(input.clauseType);
  }
  if (input.practiceArea) {
    clauses.push('practice_area = ?');
    params.push(input.practiceArea);
  }
  if (input.jurisdiction) {
    clauses.push('jurisdiction = ?');
    params.push(input.jurisdiction);
  }
  if (input.riskProfile) {
    clauses.push('risk_profile = ?');
    params.push(input.riskProfile);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  let rows = db
    .prepare(`SELECT * FROM clauses ${where} ORDER BY usage_count DESC, created_at DESC`)
    .all(...params) as Clause[];
  if (input.text && input.text.trim()) {
    const q = input.text.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.approved_text.toLowerCase().includes(q) ||
        (r.usage_notes ?? '').toLowerCase().includes(q),
    );
  }
  return rows.slice(0, input.limit ?? 50);
}

export function recordClauseUsage(id: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE clauses SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'clause.use',
    detail: `clause ${id} inserted`,
    refTable: 'clauses',
    refId: id,
  });
}

export interface UpdateClauseInput {
  id: string;
  approved_text?: string;
  usage_notes?: string;
  risk_profile?: RiskProfile;
  approved_by: string;
}

export function updateClause(input: UpdateClauseInput): Clause {
  const existing = getClause(input.id);
  if (!existing) throw new Error(`clause ${input.id} not found`);
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE clauses
       SET approved_text = COALESCE(?, approved_text),
           usage_notes = COALESCE(?, usage_notes),
           risk_profile = COALESCE(?, risk_profile),
           approved_by = ?, approved_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.approved_text ?? null,
    input.usage_notes ?? null,
    input.risk_profile ?? null,
    input.approved_by,
    now,
    now,
    input.id,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.approved_by,
    action: 'clause.update',
    detail: existing.title,
    refTable: 'clauses',
    refId: input.id,
  });
  return getClause(input.id) as Clause;
}

export function listClauseTypes(): string[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT DISTINCT clause_type FROM clauses ORDER BY clause_type`)
    .all() as { clause_type: string }[];
  return rows.map((r) => r.clause_type);
}
