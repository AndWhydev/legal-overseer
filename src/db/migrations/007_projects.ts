/**
 * Migration 007: Project Registry
 *
 * Adds the concept of a "project" as a first-class entity the overseer
 * manages. Each project is a working directory (typically containing a
 * CLAUDE.md) that the overseer can dispatch Claude Code workers into.
 *
 * Tables:
 * - projects: registered project directories with priority, status, and
 *   per-project guardrails (max iterations/day, model tier override).
 *
 * Modifications:
 * - tasks: adds `project_id` foreign key so tasks can be attributed to the
 *   project they belong to. Existing rows get NULL (skill-only tasks remain
 *   valid).
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '007_projects',
  up: (db: Database) => {
    // ========================================
    // Table: projects
    // First-class registry of dev projects the overseer can dispatch
    // Claude Code workers into. priority is 0-100 (higher = more urgent),
    // last_activity_at drives "what should I work on next?" selection.
    // ========================================
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        claude_md_path TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'paused', 'archived')),
        priority INTEGER NOT NULL DEFAULT 50
          CHECK (priority BETWEEN 0 AND 100),
        max_iterations_per_day INTEGER NOT NULL DEFAULT 24
          CHECK (max_iterations_per_day >= 0),
        model_tier_override TEXT
          CHECK (model_tier_override IS NULL
                 OR model_tier_override IN ('haiku', 'sonnet', 'opus')),
        last_activity_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_projects_status ON projects(status)`);
    db.exec(`CREATE INDEX idx_projects_priority ON projects(priority)`);
    db.exec(`CREATE INDEX idx_projects_activity ON projects(last_activity_at)`);

    logger.info('Created table: projects');

    // ========================================
    // Extend: tasks
    // Adds project_id so any task can be attributed to a project. NULL is
    // permitted — pre-existing skill-only tasks (e.g. invoice triage) remain
    // valid without a project.
    // ========================================
    db.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)`);
    db.exec(`CREATE INDEX idx_tasks_project ON tasks(project_id)`);

    logger.info('Extended table: tasks (added project_id FK)');
  },
};
