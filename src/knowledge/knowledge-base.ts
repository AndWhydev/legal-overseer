/**
 * 2.4 — Firm knowledge base.
 *
 * Searchable repository of know-how, research memos, practice notes,
 * procedures, lessons learned, and firm policy. Agents query this
 * before any drafting task so the firm's accumulated wisdom is
 * injected into every prompt.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { indexSnippet } from '../search/smart-search.js';

const logger = createSafeLogger('Knowledge');

export type KnowledgeKind =
  | 'know_how'
  | 'research_memo'
  | 'practice_note'
  | 'procedure'
  | 'lesson'
  | 'policy';

export interface KnowledgeEntry {
  id: string;
  title: string;
  body_markdown: string;
  kind: KnowledgeKind;
  practice_area: string | null;
  matter_type: string | null;
  jurisdiction: string | null;
  tags: string | null;
  is_firm_policy: number;
  author_email: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeInput {
  title: string;
  body_markdown: string;
  kind: KnowledgeKind;
  practice_area?: string;
  matter_type?: string;
  jurisdiction?: string;
  tags?: string[];
  is_firm_policy?: boolean;
  author_email: string;
}

export function createKnowledgeEntry(input: CreateKnowledgeInput): KnowledgeEntry {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO knowledge_entries
       (id, title, body_markdown, kind, practice_area, matter_type,
        jurisdiction, tags, is_firm_policy, author_email, active,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    input.title,
    input.body_markdown,
    input.kind,
    input.practice_area ?? null,
    input.matter_type ?? null,
    input.jurisdiction ?? null,
    input.tags ? JSON.stringify(input.tags) : null,
    input.is_firm_policy ? 1 : 0,
    input.author_email,
    now,
    now,
  );

  // Initial version snapshot.
  db.prepare(
    `INSERT INTO knowledge_versions (id, entry_id, version_number, body_markdown, change_note, author_email, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
  ).run(randomUUID(), id, input.body_markdown, 'initial version', input.author_email, now);

  indexSnippet({
    refKind: 'knowledge',
    refId: id,
    matterId: null,
    title: input.title,
    text: `${input.title}\n${input.body_markdown}\n${input.tags?.join(' ') ?? ''}`,
  });

  appendLegalAudit({
    matterId: null,
    actorId: input.author_email,
    action: 'knowledge.create',
    detail: `${input.kind}: ${input.title}`,
    refTable: 'knowledge_entries',
    refId: id,
  });

  logger.info(`created knowledge entry "${input.title}" (${input.kind})`);
  return getKnowledgeEntry(id) as KnowledgeEntry;
}

export function getKnowledgeEntry(id: string): KnowledgeEntry | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id) as
      | KnowledgeEntry
      | undefined) ?? null
  );
}

export interface UpdateKnowledgeInput {
  id: string;
  body_markdown: string;
  change_note?: string;
  author_email: string;
}

export function updateKnowledgeEntry(input: UpdateKnowledgeInput): KnowledgeEntry {
  const entry = getKnowledgeEntry(input.id);
  if (!entry) throw new Error(`knowledge entry ${input.id} not found`);
  const db = getDatabase();
  const now = new Date().toISOString();
  const nextVersion = ((db
    .prepare('SELECT MAX(version_number) AS v FROM knowledge_versions WHERE entry_id = ?')
    .get(input.id) as { v: number | null }).v ?? 0) + 1;

  db.prepare(
    `UPDATE knowledge_entries SET body_markdown = ?, updated_at = ? WHERE id = ?`,
  ).run(input.body_markdown, now, input.id);
  db.prepare(
    `INSERT INTO knowledge_versions (id, entry_id, version_number, body_markdown, change_note, author_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.id,
    nextVersion,
    input.body_markdown,
    input.change_note ?? null,
    input.author_email,
    now,
  );

  indexSnippet({
    refKind: 'knowledge',
    refId: input.id,
    matterId: null,
    title: entry.title,
    text: `${entry.title}\n${input.body_markdown}\n${entry.tags ?? ''}`,
  });

  appendLegalAudit({
    matterId: null,
    actorId: input.author_email,
    action: 'knowledge.update',
    detail: `${entry.title} → v${nextVersion}`,
    refTable: 'knowledge_entries',
    refId: input.id,
    metadata: { change_note: input.change_note ?? null },
  });
  return getKnowledgeEntry(input.id) as KnowledgeEntry;
}

export interface KnowledgeQuery {
  text?: string;
  kind?: KnowledgeKind;
  practiceArea?: string;
  matterType?: string;
  jurisdiction?: string;
  firmPolicyOnly?: boolean;
  limit?: number;
}

export function searchKnowledge(query: KnowledgeQuery): KnowledgeEntry[] {
  const db = getDatabase();
  const clauses: string[] = ['active = 1'];
  const params: unknown[] = [];
  if (query.kind) {
    clauses.push('kind = ?');
    params.push(query.kind);
  }
  if (query.practiceArea) {
    clauses.push('practice_area = ?');
    params.push(query.practiceArea);
  }
  if (query.matterType) {
    clauses.push('matter_type = ?');
    params.push(query.matterType);
  }
  if (query.jurisdiction) {
    clauses.push('jurisdiction = ?');
    params.push(query.jurisdiction);
  }
  if (query.firmPolicyOnly) clauses.push('is_firm_policy = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  let rows = db
    .prepare(`SELECT * FROM knowledge_entries ${where} ORDER BY updated_at DESC`)
    .all(...params) as KnowledgeEntry[];

  if (query.text && query.text.trim()) {
    const q = query.text.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.body_markdown.toLowerCase().includes(q) ||
        (r.tags ?? '').toLowerCase().includes(q),
    );
  }
  return rows.slice(0, query.limit ?? 50);
}

export function deactivateKnowledgeEntry(id: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE knowledge_entries SET active = 0 WHERE id = ?`).run(id);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'knowledge.deactivate',
    detail: `entry ${id}`,
    refTable: 'knowledge_entries',
    refId: id,
  });
}

/**
 * Inject the most relevant knowledge entries into a prompt. Used by
 * the drafting skill at the start of every task.
 */
export function injectKnowledgeForPrompt(opts: {
  matterType?: string;
  practiceArea?: string;
  topic?: string;
  limit?: number;
}): string {
  const matches = searchKnowledge({
    matterType: opts.matterType,
    practiceArea: opts.practiceArea,
    text: opts.topic,
    limit: opts.limit ?? 3,
  });
  if (!matches.length) return '';
  const lines: string[] = ['', '## Firm knowledge base (relevant entries)', ''];
  for (const m of matches) {
    lines.push(`### ${m.title} (${m.kind}${m.is_firm_policy ? ', firm policy' : ''})`);
    lines.push(m.body_markdown.slice(0, 1500));
    lines.push('');
  }
  return lines.join('\n');
}

export interface KnowledgeVersion {
  id: string;
  entry_id: string;
  version_number: number;
  body_markdown: string;
  change_note: string | null;
  author_email: string;
  created_at: string;
}

export function listKnowledgeVersions(entryId: string): KnowledgeVersion[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM knowledge_versions WHERE entry_id = ? ORDER BY version_number DESC`,
    )
    .all(entryId) as KnowledgeVersion[];
}
