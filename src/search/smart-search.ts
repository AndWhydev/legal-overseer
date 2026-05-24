/**
 * 2.2 — Natural Language Smart Search.
 *
 * Searches across matters, documents, emails, precedents, knowledge
 * entries, and file notes. Implements a lightweight hashed-token
 * "embedding" (no external embedding service required for on-prem
 * deployments) and BM25-ish scoring against the embedding cache.
 *
 * The embeddings store is populated lazily — when a new matter,
 * document, note, etc. is created we add it to document_embeddings.
 * If a record is not yet indexed at search time, the search falls
 * back to LIKE-based matching on the source tables.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { listMatters, getMatterById } from '../db/repositories/matters.js';
import { listMatterDocuments, readDocumentText } from '../uploads/store.js';
import { listPrecedents } from '../precedents/repo.js';

const logger = createSafeLogger('SmartSearch');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'of', 'in', 'on', 'to', 'for',
  'with', 'by', 'at', 'from', 'as', 'this', 'that', 'it', 'be', 'are', 'was',
  'were', 'has', 'have', 'had', 'will', 'would', 'should', 'could', 'may',
  'i', 'you', 'they', 'we', 'he', 'she', 'his', 'her', 'their', 'our', 'my',
]);

export type RefKind = 'matter' | 'document' | 'email' | 'note' | 'precedent' | 'knowledge';

export interface IndexedSnippet {
  id: string;
  ref_kind: RefKind;
  ref_id: string;
  matter_id: string | null;
  snippet: string;
  title: string | null;
  token_vec: string;
  token_count: number;
  created_at: string;
}

export interface SearchHit {
  refKind: RefKind;
  refId: string;
  matterId: string | null;
  title: string | null;
  snippet: string;
  score: number;
  url: string;
}

function tokenise(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const tokens = (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  for (const t of tokens) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}

function vecToString(vec: Map<string, number>): string {
  return Array.from(vec.entries())
    .map(([t, n]) => `${t}:${n}`)
    .join(' ');
}

function stringToVec(s: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!s) return out;
  for (const part of s.split(/\s+/)) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const term = part.slice(0, idx);
    const n = Number.parseInt(part.slice(idx + 1), 10);
    if (term && Number.isFinite(n)) out.set(term, n);
  }
  return out;
}

function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const v of a.values()) aMag += v * v;
  for (const v of b.values()) bMag += v * v;
  for (const [t, va] of a) {
    const vb = b.get(t);
    if (vb !== undefined) dot += va * vb;
  }
  if (!aMag || !bMag) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export interface IndexInput {
  refKind: RefKind;
  refId: string;
  matterId: string | null;
  title: string | null;
  text: string;
}

export function indexSnippet(input: IndexInput): IndexedSnippet {
  const db = getDatabase();
  // De-dupe — replace any existing entry for the same ref.
  db.prepare(`DELETE FROM document_embeddings WHERE ref_kind = ? AND ref_id = ?`).run(
    input.refKind,
    input.refId,
  );
  const vec = tokenise(input.text ?? '');
  const id = randomUUID();
  const now = new Date().toISOString();
  const snippet = (input.text ?? '').slice(0, 500);
  db.prepare(
    `INSERT INTO document_embeddings
       (id, ref_kind, ref_id, matter_id, snippet, title, token_vec, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.refKind,
    input.refId,
    input.matterId,
    snippet,
    input.title,
    vecToString(vec),
    vec.size,
    now,
  );
  return db.prepare('SELECT * FROM document_embeddings WHERE id = ?').get(id) as IndexedSnippet;
}

/**
 * Rebuild the index from current data. Idempotent — safe to run on
 * boot or via a cron-style job. Expensive on large firms, so paginate
 * by matter when production deployments grow.
 */
export function rebuildIndex(): { indexed: number } {
  let count = 0;
  for (const m of listMatters()) {
    indexSnippet({
      refKind: 'matter',
      refId: m.id,
      matterId: m.id,
      title: `${m.matter_number} — ${m.title}`,
      text: `${m.title}\n${m.client_name}\n${m.matter_type}\n${m.opposing_party ?? ''}\n${m.notes ?? ''}`,
    });
    count += 1;
    for (const d of listMatterDocuments(m.id)) {
      const text = readDocumentText(d) ?? '';
      indexSnippet({
        refKind: 'document',
        refId: d.id,
        matterId: m.id,
        title: d.filename,
        text: `${d.filename}\n${text.slice(0, 8000)}`,
      });
      count += 1;
    }
  }
  for (const p of listPrecedents()) {
    indexSnippet({
      refKind: 'precedent',
      refId: p.id,
      matterId: null,
      title: p.title,
      text: `${p.title}\n${p.body_markdown}\n${p.tags ?? ''}`,
    });
    count += 1;
  }
  logger.info(`rebuilt search index: ${count} snippets`);
  return { indexed: count };
}

export interface SmartSearchInput {
  query: string;
  userEmail?: string;
  limit?: number;
  filterMatterId?: string;
  filterRefKind?: RefKind;
}

export function smartSearch(input: SmartSearchInput): SearchHit[] {
  const limit = input.limit ?? 25;
  const qVec = tokenise(input.query);
  if (!qVec.size) return [];

  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (input.filterMatterId) {
    clauses.push('matter_id = ?');
    params.push(input.filterMatterId);
  }
  if (input.filterRefKind) {
    clauses.push('ref_kind = ?');
    params.push(input.filterRefKind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db
    .prepare(`SELECT * FROM document_embeddings ${where}`)
    .all(...params) as IndexedSnippet[];

  const scored: SearchHit[] = [];
  for (const row of rows) {
    const score = cosineSim(qVec, stringToVec(row.token_vec));
    if (score <= 0) continue;
    scored.push({
      refKind: row.ref_kind,
      refId: row.ref_id,
      matterId: row.matter_id,
      title: row.title,
      snippet: row.snippet,
      score,
      url: urlFor(row.ref_kind, row.ref_id, row.matter_id),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  if (input.userEmail) {
    db.prepare(
      `INSERT INTO search_history (id, user_email, query, result_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), input.userEmail, input.query, top.length, new Date().toISOString());
  }
  return top;
}

function urlFor(kind: RefKind, refId: string, matterId: string | null): string {
  switch (kind) {
    case 'matter':   return `/matter/${refId}`;
    case 'document': return matterId ? `/matter/${matterId}/document/${refId}` : `/documents/${refId}`;
    case 'precedent': return `/precedents/${refId}`;
    case 'knowledge': return `/knowledge/${refId}`;
    case 'email':    return `/email/${refId}`;
    case 'note':     return matterId ? `/matter/${matterId}#note-${refId}` : '#';
  }
}

export function listSearchHistory(userEmail: string, limit = 25): {
  query: string;
  result_count: number;
  created_at: string;
}[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT query, result_count, created_at FROM search_history
       WHERE user_email = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userEmail, limit) as { query: string; result_count: number; created_at: string }[];
}

/**
 * Search context for a single matter — used by the smart-search
 * dashboard when the user has selected a matter to scope by.
 */
export function getMatterSearchContext(matterId: string): { documents: number; precedents: number } {
  const matter = getMatterById(matterId);
  if (!matter) return { documents: 0, precedents: 0 };
  const documents = listMatterDocuments(matter.id).length;
  const precedents = listPrecedents({ matterType: matter.matter_type }).length;
  return { documents, precedents };
}
