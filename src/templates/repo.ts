/**
 * Document templates repository.
 *
 * Templates are keyed by a stable slug + a monotonically-increasing
 * version. Every update creates a new `document_template_versions`
 * row so the audit story stays intact even after a lawyer edits a
 * shipping template.
 *
 * Built-in templates (from src/templates/legal/*.md) are seeded on
 * first boot with source='builtin'. Firm-added templates are
 * source='firm'. The drafting skill prefers active templates that
 * match its matter type.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';

export type TemplateSource = 'builtin' | 'firm';

export type TemplateCategory =
  | 'nda'
  | 'retainer'
  | 'demand_letter'
  | 'court_document'
  | 'contract'
  | 'correspondence'
  | 'other';

export interface DocumentTemplate {
  id: string;
  slug: string;
  category: TemplateCategory;
  title: string;
  description: string | null;
  body_markdown: string;
  author_email: string | null;
  source: TemplateSource;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentTemplateVersion {
  id: string;
  template_id: string;
  version: number;
  body_markdown: string;
  change_note: string | null;
  author_email: string | null;
  created_at: string;
}

function rowToTemplate(row: Omit<DocumentTemplate, 'active'> & { active: number }): DocumentTemplate {
  return { ...row, active: row.active === 1 };
}

export interface UpsertTemplateInput {
  slug: string;
  category: TemplateCategory;
  title: string;
  description?: string | null;
  body_markdown: string;
  author_email?: string | null;
  source?: TemplateSource;
  change_note?: string;
}

export function upsertTemplate(input: UpsertTemplateInput): DocumentTemplate {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM document_templates WHERE slug = ?')
    .get(input.slug) as (Omit<DocumentTemplate, 'active'> & { active: number }) | undefined;

  if (existing) {
    if (existing.body_markdown !== input.body_markdown
        || existing.title !== input.title
        || existing.category !== input.category) {
      const nextVersion = (db.prepare(
        'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM document_template_versions WHERE template_id = ?',
      ).get(existing.id) as { v: number }).v;
      db.prepare(
        `INSERT INTO document_template_versions
           (id, template_id, version, body_markdown, change_note, author_email)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), existing.id, nextVersion, input.body_markdown, input.change_note ?? null, input.author_email ?? null);
      db.prepare(
        `UPDATE document_templates SET
           category = ?, title = ?, description = ?, body_markdown = ?,
           author_email = ?, updated_at = ?
         WHERE id = ?`,
      ).run(input.category, input.title, input.description ?? null, input.body_markdown, input.author_email ?? existing.author_email, now, existing.id);
    }
    return getTemplateBySlug(input.slug) as DocumentTemplate;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO document_templates
       (id, slug, category, title, description, body_markdown, author_email, source, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id, input.slug, input.category, input.title,
    input.description ?? null, input.body_markdown,
    input.author_email ?? null, input.source ?? 'firm', now, now,
  );
  db.prepare(
    `INSERT INTO document_template_versions
       (id, template_id, version, body_markdown, change_note, author_email)
     VALUES (?, ?, 1, ?, ?, ?)`,
  ).run(randomUUID(), id, input.body_markdown, input.change_note ?? 'initial version', input.author_email ?? null);
  return getTemplateBySlug(input.slug) as DocumentTemplate;
}

export function getTemplateBySlug(slug: string): DocumentTemplate | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM document_templates WHERE slug = ?')
    .get(slug) as (Omit<DocumentTemplate, 'active'> & { active: number }) | undefined;
  return row ? rowToTemplate(row) : null;
}

export function getTemplateById(id: string): DocumentTemplate | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM document_templates WHERE id = ?')
    .get(id) as (Omit<DocumentTemplate, 'active'> & { active: number }) | undefined;
  return row ? rowToTemplate(row) : null;
}

export function listTemplates(category?: TemplateCategory, includeInactive = false): DocumentTemplate[] {
  const db = getDatabase();
  if (category) {
    const rows = db
      .prepare(`SELECT * FROM document_templates WHERE category = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY title`)
      .all(category) as (Omit<DocumentTemplate, 'active'> & { active: number })[];
    return rows.map(rowToTemplate);
  }
  const rows = db
    .prepare(`SELECT * FROM document_templates ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY category, title`)
    .all() as (Omit<DocumentTemplate, 'active'> & { active: number })[];
  return rows.map(rowToTemplate);
}

export function listTemplateVersions(templateId: string): DocumentTemplateVersion[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM document_template_versions WHERE template_id = ? ORDER BY version DESC')
    .all(templateId) as DocumentTemplateVersion[];
}

export function setTemplateActive(id: string, active: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE document_templates SET active = ?, updated_at = ? WHERE id = ?').run(
    active ? 1 : 0, new Date().toISOString(), id,
  );
}

export interface TemplateMatchInput {
  category?: TemplateCategory;
  matterType?: string;
  documentType?: string;
}

/**
 * Choose the most relevant template for a drafting request.
 * Simple priority:
 *   1. Exact category match.
 *   2. Title or description contains matterType.
 *   3. Title or description contains documentType.
 *   4. Most recently updated.
 */
export function pickBestTemplate(input: TemplateMatchInput): DocumentTemplate | null {
  const all = listTemplates();
  if (!all.length) return null;
  const scored = all.map((t) => {
    let score = 0;
    const hay = `${t.title}\n${t.description ?? ''}`.toLowerCase();
    if (input.category && t.category === input.category) score += 10;
    if (input.matterType && hay.includes(input.matterType.toLowerCase())) score += 5;
    if (input.documentType && hay.includes(input.documentType.toLowerCase())) score += 3;
    return { template: t, score };
  });
  scored.sort((a, b) => b.score - a.score || b.template.updated_at.localeCompare(a.template.updated_at));
  const best = scored[0];
  if (best.score === 0) return null;
  return best.template;
}
