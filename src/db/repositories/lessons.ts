/**
 * Lessons repository.
 *
 * Append-mostly access layer for the lessons table. Read paths support
 * keyword-style retrieval (LIKE over title+body+tags) and per-project
 * ranking by importance + recency.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('LessonRepo');

export type LessonOutcome = 'success' | 'partial' | 'failure';

export interface Lesson {
  id: string;
  project_id: string | null;
  source_task_id: string | null;
  outcome: LessonOutcome;
  title: string;
  body: string;
  /** Comma-separated. Empty string when none. */
  tags: string;
  /** 1–5, higher = inject earlier. */
  importance: number;
  recall_count: number;
  last_recalled_at: string | null;
  created_at: string;
}

export interface CreateLessonInput {
  project_id?: string | null;
  source_task_id?: string | null;
  outcome: LessonOutcome;
  title: string;
  body: string;
  tags?: string[];
  importance?: number;
}

/**
 * Insert a new lesson. Returns the created row.
 */
export function createLesson(input: CreateLessonInput): Lesson {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const tagsCsv = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).join(',');
  const importance = Math.max(1, Math.min(5, input.importance ?? 3));

  db.prepare(
    `
    INSERT INTO lessons (
      id, project_id, source_task_id, outcome, title, body, tags,
      importance, recall_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `,
  ).run(
    id,
    input.project_id ?? null,
    input.source_task_id ?? null,
    input.outcome,
    input.title,
    input.body,
    tagsCsv,
    importance,
    now,
  );

  logger.info(`Lesson created: ${id} (${input.outcome}, importance=${importance})`);
  return {
    id,
    project_id: input.project_id ?? null,
    source_task_id: input.source_task_id ?? null,
    outcome: input.outcome,
    title: input.title,
    body: input.body,
    tags: tagsCsv,
    importance,
    recall_count: 0,
    last_recalled_at: null,
    created_at: now,
  };
}

/**
 * Fetch lessons most relevant to a project + (optional) prompt.
 *
 * Ranking:
 *   1. Project-scoped lessons rank above null-project lessons.
 *   2. Lessons whose title/body/tags match any keyword from the prompt
 *      get a relevance bump.
 *   3. Ties broken by importance desc, then created_at desc.
 *
 * Returns up to `limit` lessons. Each returned row's recall_count is
 * incremented so we can decay stale lessons later.
 */
export function getRelevantLessons(
  projectId: string,
  promptKeywords: string[],
  limit = 5,
): Lesson[] {
  const db = getDatabase();
  const keywords = promptKeywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 4)
    .slice(0, 8);

  // Build a relevance score in SQL: project match + keyword match count.
  // Using LOWER for case-insensitive comparison. SQLite LIKE is already
  // case-insensitive for ASCII so this is belt-and-braces.
  const keywordScoreSql = keywords.length
    ? keywords
        .map(() => `(CASE WHEN (LOWER(title) LIKE ? OR LOWER(body) LIKE ? OR LOWER(tags) LIKE ?) THEN 1 ELSE 0 END)`)
        .join(' + ')
    : '0';

  const params: unknown[] = [projectId];
  for (const k of keywords) {
    const pat = `%${k}%`;
    params.push(pat, pat, pat);
  }
  params.push(limit);

  const rows = db
    .prepare(
      `
      SELECT
        *,
        (CASE WHEN project_id = ? THEN 2 ELSE 0 END) + (${keywordScoreSql}) AS _score
      FROM lessons
      ORDER BY _score DESC, importance DESC, created_at DESC
      LIMIT ?
      `,
    )
    .all(...params) as Array<Lesson & { _score: number }>;

  // Bump recall counts (best-effort; not transactional with the read).
  const recalled = rows.filter((r) => r._score > 0);
  if (recalled.length > 0) {
    const now = new Date().toISOString();
    const update = db.prepare(
      `UPDATE lessons SET recall_count = recall_count + 1, last_recalled_at = ? WHERE id = ?`,
    );
    const tx = db.transaction(() => {
      for (const r of recalled) update.run(now, r.id);
    });
    tx();
  }

  // Strip the synthetic _score column from the result type.
  return rows.map(({ _score: _ignored, ...rest }) => rest);
}

/**
 * All lessons for a project, newest first. Used by the playbook rewriter.
 */
export function getLessonsByProject(projectId: string, limit = 50): Lesson[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM lessons
       WHERE project_id = ?
       ORDER BY importance DESC, created_at DESC
       LIMIT ?`,
    )
    .all(projectId, limit) as Lesson[];
}

/**
 * Count lessons (optionally filtered by project) — used by the briefing.
 */
export function countLessons(projectId?: string): number {
  const db = getDatabase();
  if (projectId) {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM lessons WHERE project_id = ?`)
      .get(projectId) as { n: number };
    return row.n;
  }
  const row = db.prepare(`SELECT COUNT(*) AS n FROM lessons`).get() as { n: number };
  return row.n;
}
