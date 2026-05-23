/**
 * Project repository module for BitBit
 *
 * Provides data access layer for the projects table. Used by the overseer
 * loop to pick the next project that needs attention and by the Claude Code
 * worker skill to resolve a project_id to a working directory.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ProjectRepo');

export type ProjectStatus = 'active' | 'paused' | 'archived';
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/**
 * Project entity representing a row in the projects table
 */
export interface Project {
  id: string;
  name: string;
  path: string;
  claude_md_path: string | null;
  status: ProjectStatus;
  priority: number;
  max_iterations_per_day: number;
  model_tier_override: ModelTier | null;
  last_activity_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new project. id is generated, timestamps are managed
 * by the database.
 */
export interface CreateProjectInput {
  name: string;
  path: string;
  claude_md_path?: string | null;
  status?: ProjectStatus;
  priority?: number;
  max_iterations_per_day?: number;
  model_tier_override?: ModelTier | null;
  notes?: string | null;
}

/**
 * Patch type for updateProject. Any subset of mutable fields.
 */
export interface UpdateProjectInput {
  name?: string;
  path?: string;
  claude_md_path?: string | null;
  status?: ProjectStatus;
  priority?: number;
  max_iterations_per_day?: number;
  model_tier_override?: ModelTier | null;
  notes?: string | null;
}

/**
 * Create a new project entry.
 *
 * @returns The created project row
 */
export function createProject(input: CreateProjectInput): Project {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  const row: Project = {
    id,
    name: input.name,
    path: input.path,
    claude_md_path: input.claude_md_path ?? null,
    status: input.status ?? 'active',
    priority: input.priority ?? 50,
    max_iterations_per_day: input.max_iterations_per_day ?? 24,
    model_tier_override: input.model_tier_override ?? null,
    last_activity_at: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `
    INSERT INTO projects (
      id, name, path, claude_md_path, status, priority,
      max_iterations_per_day, model_tier_override, notes,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    row.id,
    row.name,
    row.path,
    row.claude_md_path,
    row.status,
    row.priority,
    row.max_iterations_per_day,
    row.model_tier_override,
    row.notes,
    row.created_at,
    row.updated_at,
  );

  logger.info(`Project created: ${row.id} (${row.name} @ ${row.path})`);
  return row;
}

/**
 * Partial update of a project. Only provided fields are written; updated_at
 * is bumped automatically. Returns the updated row, or null if not found.
 */
export function updateProject(id: string, patch: UpdateProjectInput): Project | null {
  const db = getDatabase();

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) {
    return getProjectById(id);
  }

  fields.push(`updated_at = ?`);
  values.push(new Date().toISOString());
  values.push(id);

  const result = db
    .prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);

  if (result.changes === 0) return null;
  return getProjectById(id);
}

/**
 * Delete a project by id. Returns true if a row was removed.
 *
 * NOTE: any tasks referencing this project will keep their project_id (FK is
 * not ON DELETE CASCADE by design — we want orphaned tasks visible, not
 * silently dropped).
 */
export function deleteProject(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Get a project by its id.
 */
export function getProjectById(id: string): Project | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Project
    | undefined;
  return row ?? null;
}

/**
 * Find a project by absolute filesystem path.
 */
export function getProjectByPath(path: string): Project | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM projects WHERE path = ?`)
    .get(path) as Project | undefined;
  return row ?? null;
}

/**
 * Find a project by name (case-insensitive). Names are not unique; this
 * returns the first match.
 */
export function getProjectByName(name: string): Project | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1`)
    .get(name) as Project | undefined;
  return row ?? null;
}

/**
 * All projects regardless of status, ordered by priority desc then name.
 */
export function getAllProjects(): Project[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM projects ORDER BY priority DESC, name ASC`)
    .all() as Project[];
}

/**
 * All active projects, ordered by priority desc then name.
 */
export function getActiveProjects(): Project[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM projects WHERE status = 'active' ORDER BY priority DESC, name ASC`
    )
    .all() as Project[];
}

/**
 * Pick the active project most in need of attention.
 *
 * Higher priority wins; among the same priority, the project with the
 * oldest last_activity_at wins (NULL — never touched — sorts first because
 * SQLite treats NULL as smaller than any value in ASC ordering).
 */
export function getNextProjectNeedingAttention(): Project | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
      SELECT * FROM projects
      WHERE status = 'active'
      ORDER BY priority DESC, last_activity_at ASC
      LIMIT 1
      `
    )
    .get() as Project | undefined;
  return row ?? null;
}

/**
 * Stamp last_activity_at = now for a project. Called whenever the overseer
 * dispatches a worker for the project so the round-robin selection works.
 */
export function touchActivity(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET last_activity_at = ?, updated_at = ? WHERE id = ?`
  ).run(now, now, id);
}

/**
 * Count projects by status. Useful for briefing/dashboard summaries.
 */
export function getProjectCounts(): { active: number; paused: number; archived: number } {
  const db = getDatabase();
  const result = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'paused'   THEN 1 ELSE 0 END) AS paused,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
      FROM projects
      `
    )
    .get() as { active: number | null; paused: number | null; archived: number | null };

  return {
    active: result.active ?? 0,
    paused: result.paused ?? 0,
    archived: result.archived ?? 0,
  };
}
