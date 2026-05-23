/**
 * Task repository module for BitBit
 *
 * Provides data access layer for tasks table with atomic operations
 * to prevent race conditions in task pickup.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('TaskRepo');

/**
 * Task entity representing a row in the tasks table
 */
export interface Task {
  id: string;
  clickup_id: string | null;
  skill_id: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  input_json: string | null;
  output_json: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  project_id: string | null;
  created_at: string;
}

/**
 * Create a new task in pending status
 *
 * @param skillId - Skill that will handle this task (e.g., 'gatekeeper', 'rd_scout')
 * @param source - Source of the task (e.g., 'clickup_webhook', 'telegram', 'scheduler')
 * @param input - JSON string of task input data
 * @param clickupId - Optional ClickUp task ID if originating from ClickUp
 * @returns The created task
 */
export function createTask(
  skillId: string,
  source: string,
  input: string,
  clickupId?: string,
  projectId?: string,
): Task {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO tasks (id, skill_id, clickup_id, project_id, status, input_json, created_at, retry_count)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, 0)
  `
  ).run(id, skillId, clickupId || null, projectId || null, input, now);

  logger.info(`Task created: ${id} (skill=${skillId}, source=${source}${projectId ? `, project=${projectId}` : ''})`);

  return {
    id,
    clickup_id: clickupId || null,
    skill_id: skillId,
    status: 'pending',
    input_json: input,
    output_json: null,
    started_at: null,
    completed_at: null,
    error_message: null,
    retry_count: 0,
    project_id: projectId || null,
    created_at: now,
  };
}

/**
 * Get the next pending task and atomically mark it as running
 *
 * Uses a transaction to prevent race conditions when multiple
 * processors might try to pick up the same task.
 *
 * @returns The task that was picked up, or null if no pending tasks
 */
export function getNextPendingTask(): Task | null {
  const db = getDatabase();

  return db.transaction(() => {
    const task = db
      .prepare(
        `
      SELECT * FROM tasks
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `
      )
      .get() as Task | undefined;

    if (task) {
      db.prepare(
        `
        UPDATE tasks
        SET status = 'running', started_at = ?
        WHERE id = ?
      `
      ).run(new Date().toISOString(), task.id);

      // Return the task with updated status
      return { ...task, status: 'running' as const, started_at: new Date().toISOString() };
    }

    return null;
  })();
}

/**
 * Mark a task as completed with output
 *
 * @param id - Task ID to update
 * @param output - JSON string of task output
 */
export function markCompleted(id: string, output: string): void {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    UPDATE tasks
    SET status = 'completed', output_json = ?, completed_at = ?
    WHERE id = ?
  `
    )
    .run(output, new Date().toISOString(), id);

  if (result.changes === 0) {
    throw new Error(`Task not found: ${id}`);
  }
}

/**
 * Mark a task as failed with error message
 *
 * @param id - Task ID to update
 * @param error - Error message describing the failure
 */
export function markFailed(id: string, error: string): void {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    UPDATE tasks
    SET status = 'failed', error_message = ?, completed_at = ?
    WHERE id = ?
  `
    )
    .run(error, new Date().toISOString(), id);

  if (result.changes === 0) {
    throw new Error(`Task not found: ${id}`);
  }
}

/**
 * Get a task by its ID
 *
 * @param id - Task ID to look up
 * @returns The task if found, or null
 */
export function getById(id: string): Task | null {
  const db = getDatabase();

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;

  return task || null;
}

/**
 * Get recent tasks (pending, running, awaiting_approval)
 *
 * @param limit - Maximum number of tasks to return
 * @returns Array of recent tasks ordered by created_at desc
 */
export function getRecentTasks(limit: number = 5): Task[] {
  const db = getDatabase();

  const tasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('pending', 'running', 'awaiting_approval')
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Task[];

  return tasks;
}

/**
 * Get task counts by status
 *
 * @returns Object with counts for each status
 */
export function getTaskCounts(): { pending: number; running: number; awaitingApproval: number; completed: number; failed: number } {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'awaiting_approval' THEN 1 ELSE 0 END) as awaiting_approval,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM tasks
  `).get() as { pending: number; running: number; awaiting_approval: number; completed: number; failed: number };

  return {
    pending: result.pending || 0,
    running: result.running || 0,
    awaitingApproval: result.awaiting_approval || 0,
    completed: result.completed || 0,
    failed: result.failed || 0,
  };
}

/**
 * Task statistics result for time-windowed queries
 */
export interface TaskStats {
  total: number;
  bySkill: {
    rd_scout: number;
    gatekeeper: number;
    ops_officer: number;
    general: number;
  };
  byStatus: {
    pending: number;
    completed: number;
    failed: number;
    awaitingApproval: number;
  };
}

/**
 * Get task statistics for a time window
 *
 * @param hours - Number of hours to look back (default: 24)
 * @returns Task statistics broken down by skill and status
 */
export function getTaskStats24h(hours: number = 24): TaskStats {
  const db = getDatabase();

  // Get counts by skill
  const skillResult = db.prepare(`
    SELECT
      SUM(CASE WHEN skill_id = 'rd_scout' THEN 1 ELSE 0 END) as rd_scout,
      SUM(CASE WHEN skill_id = 'gatekeeper' THEN 1 ELSE 0 END) as gatekeeper,
      SUM(CASE WHEN skill_id = 'ops_officer' THEN 1 ELSE 0 END) as ops_officer,
      SUM(CASE WHEN skill_id NOT IN ('rd_scout', 'gatekeeper', 'ops_officer') THEN 1 ELSE 0 END) as general,
      COUNT(*) as total
    FROM tasks
    WHERE created_at > datetime('now', '-' || ? || ' hours')
  `).get(hours) as {
    rd_scout: number;
    gatekeeper: number;
    ops_officer: number;
    general: number;
    total: number;
  };

  // Get counts by status
  const statusResult = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'awaiting_approval' THEN 1 ELSE 0 END) as awaiting_approval
    FROM tasks
    WHERE created_at > datetime('now', '-' || ? || ' hours')
  `).get(hours) as {
    pending: number;
    completed: number;
    failed: number;
    awaiting_approval: number;
  };

  return {
    total: skillResult.total || 0,
    bySkill: {
      rd_scout: skillResult.rd_scout || 0,
      gatekeeper: skillResult.gatekeeper || 0,
      ops_officer: skillResult.ops_officer || 0,
      general: skillResult.general || 0,
    },
    byStatus: {
      pending: statusResult.pending || 0,
      completed: statusResult.completed || 0,
      failed: statusResult.failed || 0,
      awaitingApproval: statusResult.awaiting_approval || 0,
    },
  };
}

/**
 * Get completed task outputs for a specific skill within a time window
 *
 * Used to extract skill-specific metrics from task outputs
 * (e.g., opportunities found, invoices processed).
 *
 * @param skillId - Skill ID to filter by (e.g., 'rd_scout', 'gatekeeper', 'ops_officer')
 * @param hours - Number of hours to look back
 * @returns Array of parsed output_json values from completed tasks
 */
export function getCompletedTaskOutputs(skillId: string, hours: number): unknown[] {
  const db = getDatabase();

  const results = db.prepare(`
    SELECT output_json
    FROM tasks
    WHERE skill_id = ?
      AND status = 'completed'
      AND output_json IS NOT NULL
      AND completed_at > datetime('now', '-' || ? || ' hours')
    ORDER BY completed_at DESC
  `).all(skillId, hours) as { output_json: string }[];

  return results.map((row) => {
    try {
      return JSON.parse(row.output_json);
    } catch {
      return row.output_json;
    }
  });
}
