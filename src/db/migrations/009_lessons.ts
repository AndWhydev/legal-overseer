/**
 * Migration 009: Lessons learned.
 *
 * Append-only table where the overseer writes one row per completed
 * worker task: "I tried X on project Y, outcome was Z, here's what I
 * learned." The retrieval path queries by project + (optional) keyword
 * to inject the most relevant lessons into the next worker prompt.
 *
 * Schema choices:
 * - project_id is nullable so we can store cross-project lessons too.
 * - source_task_id is the worker task the lesson was extracted from,
 *   nullable for synthesized / hand-edited lessons. No FK constraint
 *   so we can keep lessons even after a task is purged.
 * - tags is a comma-separated list (cheap, queryable with LIKE).
 * - importance (1–5) tunes retrieval order.
 * - outcome is one of {success, partial, failure} so we can teach
 *   "what worked" and "what to avoid" symmetrically.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '009_lessons',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE lessons (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        source_task_id TEXT,
        outcome TEXT NOT NULL
          CHECK (outcome IN ('success', 'partial', 'failure')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        importance INTEGER NOT NULL DEFAULT 3
          CHECK (importance BETWEEN 1 AND 5),
        recall_count INTEGER NOT NULL DEFAULT 0,
        last_recalled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_lessons_project ON lessons(project_id)`);
    db.exec(`CREATE INDEX idx_lessons_outcome ON lessons(outcome)`);
    db.exec(`CREATE INDEX idx_lessons_importance ON lessons(importance)`);
    db.exec(`CREATE INDEX idx_lessons_created ON lessons(created_at)`);

    logger.info('Created table: lessons');
  },
};
