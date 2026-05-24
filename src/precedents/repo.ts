/**
 * Precedents repository.
 *
 * A precedent is a previously-approved firm document that the drafting
 * skill can read before drafting new work. Each precedent is stored
 * both:
 *   1. In the `precedents` SQLite table (index, search, dashboard).
 *   2. As a Markdown file under PRECEDENTS_ROOT/<category>/<slug>.md
 *      so the firm can inspect, edit, or back up precedents without
 *      touching the database.
 *
 * Adding a precedent happens via the "Offer for precedent library"
 * button on an approved review_queue row.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';

export interface Precedent {
  id: string;
  title: string;
  category: string;
  practice_area: string | null;
  matter_type: string | null;
  document_type: string | null;
  body_markdown: string;
  source_review_id: string | null;
  source_matter_id: string | null;
  added_by: string | null;
  tags: string | null;
  created_at: string;
}

function precedentsRoot(): string {
  return process.env.PRECEDENTS_ROOT
    || (process.env.NODE_ENV === 'production' ? '/data/precedents' : './data/precedents');
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
}

export interface AddPrecedentInput {
  title: string;
  category: string;
  practice_area?: string | null;
  matter_type?: string | null;
  document_type?: string | null;
  body_markdown: string;
  source_review_id?: string | null;
  source_matter_id?: string | null;
  added_by?: string | null;
  tags?: string[] | null;
}

export function addPrecedent(input: AddPrecedentInput): Precedent {
  const db = getDatabase();
  const id = randomUUID();
  const tags = input.tags && input.tags.length ? JSON.stringify(input.tags) : null;
  db.prepare(
    `INSERT INTO precedents
       (id, title, category, practice_area, matter_type, document_type,
        body_markdown, source_review_id, source_matter_id, added_by, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.title, input.category,
    input.practice_area ?? null, input.matter_type ?? null, input.document_type ?? null,
    input.body_markdown,
    input.source_review_id ?? null, input.source_matter_id ?? null,
    input.added_by ?? null, tags,
  );

  // Persist a copy on disk so backups + manual edits are possible.
  try {
    const dir = join(precedentsRoot(), slugify(input.category));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${slugify(input.title)}-${id.slice(0, 8)}.md`), input.body_markdown, { mode: 0o600 });
  } catch {
    // Disk write is best-effort — the DB is canonical.
  }
  return getPrecedentById(id) as Precedent;
}

export function getPrecedentById(id: string): Precedent | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM precedents WHERE id = ?').get(id) as Precedent | undefined) ?? null;
}

export function listPrecedents(opts: { category?: string; matterType?: string } = {}): Precedent[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.category) { clauses.push('category = ?'); params.push(opts.category); }
  if (opts.matterType) { clauses.push('matter_type = ?'); params.push(opts.matterType); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM precedents ${where} ORDER BY created_at DESC`).all(...params) as Precedent[];
}

export interface SearchPrecedentsInput {
  query?: string;
  matterType?: string;
  documentType?: string;
  category?: string;
  limit?: number;
}

export function searchPrecedents(input: SearchPrecedentsInput): Precedent[] {
  const all = listPrecedents();
  const q = input.query?.trim().toLowerCase() ?? '';
  const filtered = all.filter((p) => {
    if (input.category && p.category !== input.category) return false;
    if (input.matterType && p.matter_type !== input.matterType) return false;
    if (input.documentType && p.document_type !== input.documentType) return false;
    if (q) {
      const hay = `${p.title}\n${p.body_markdown}\n${p.tags ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return filtered.slice(0, input.limit ?? 50);
}

export interface PrecedentMatchInput {
  matterType?: string;
  documentType?: string;
  practiceArea?: string;
}

export function pickBestPrecedent(input: PrecedentMatchInput): Precedent | null {
  const all = listPrecedents();
  if (!all.length) return null;
  const scored = all.map((p) => {
    let score = 0;
    if (input.matterType && p.matter_type === input.matterType) score += 6;
    if (input.documentType && p.document_type === input.documentType) score += 6;
    if (input.practiceArea && p.practice_area === input.practiceArea) score += 3;
    const hay = `${p.title}\n${p.body_markdown}`.toLowerCase();
    if (input.documentType && hay.includes(input.documentType.toLowerCase())) score += 1;
    return { precedent: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score === 0) return null;
  return scored[0].precedent;
}

export interface PrecedentFile {
  category: string;
  filename: string;
  body_markdown: string;
}

export function readPrecedentFromDisk(category: string, filename: string): PrecedentFile | null {
  try {
    const path = join(precedentsRoot(), slugify(category), filename);
    if (!existsSync(path)) return null;
    return { category, filename, body_markdown: readFileSync(path, 'utf8') };
  } catch {
    return null;
  }
}
