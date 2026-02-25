import db from '../db';

// ============================================
// Task Types
// ============================================

export type TaskOwner = 'xixi' | 'allen';
export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface CreateTaskParams {
  title: string;
  owner: TaskOwner;
  description?: string;
  due_days?: number; // days from now
  approval_item_id?: number; // optional link to approval item
}

export interface TaskResult {
  id: number;
  title: string;
  owner: TaskOwner;
  status: TaskStatus;
  description: string | null;
  due_date: string | null;
  approval_item_id: number | null;
  created_at: string;
}

// ============================================
// Helper Functions
// ============================================

function parseTask(row: any): TaskResult {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner as TaskOwner,
    status: row.status as TaskStatus,
    description: row.description,
    due_date: row.due_date,
    approval_item_id: row.approval_item_id,
    created_at: row.created_at,
  };
}

function calculateDueDate(dueDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dueDays);
  return date.toISOString().split('T')[0];
}

// ============================================
// Task Service Functions
// ============================================

/**
 * Create a new task
 */
export function createTask(params: CreateTaskParams): TaskResult {
  const { title, owner, description, due_days, approval_item_id } = params;

  const dueDate = due_days !== undefined ? calculateDueDate(due_days) : null;

  const result = db.prepare(`
    INSERT INTO tasks (title, owner, description, due_date, approval_item_id, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(title, owner, description || null, dueDate, approval_item_id || null);

  console.log(`[TaskService] Created task: "${title}" for ${owner}${dueDate ? ` (due: ${dueDate})` : ''}`);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  return parseTask(task);
}

/**
 * Get all open tasks, optionally filtered by owner
 */
export function getOpenTasks(owner?: TaskOwner): TaskResult[] {
  let rows: any[];

  if (owner) {
    rows = db.prepare(`
      SELECT * FROM tasks
      WHERE status != 'done' AND owner = ?
      ORDER BY due_date ASC NULLS LAST, created_at DESC
    `).all(owner);
  } else {
    rows = db.prepare(`
      SELECT * FROM tasks
      WHERE status != 'done'
      ORDER BY due_date ASC NULLS LAST, created_at DESC
    `).all();
  }

  console.log(`[TaskService] getOpenTasks(${owner || 'all'}) -> ${rows.length} tasks`);
  return rows.map(parseTask);
}

/**
 * Mark a task as complete
 */
export function completeTask(taskId: number): boolean {
  const result = db.prepare(`
    UPDATE tasks
    SET status = 'done', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(taskId);

  const success = result.changes > 0;
  console.log(`[TaskService] completeTask(${taskId}) -> ${success ? 'completed' : 'not found'}`);
  return success;
}

/**
 * Update task status
 */
export function updateTaskStatus(taskId: number, status: TaskStatus): boolean {
  const result = db.prepare(`
    UPDATE tasks
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, taskId);

  const success = result.changes > 0;
  console.log(`[TaskService] updateTaskStatus(${taskId}, ${status}) -> ${success ? 'updated' : 'not found'}`);
  return success;
}

/**
 * Get a single task by ID
 */
export function getTask(taskId: number): TaskResult | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

  if (!row) {
    console.log(`[TaskService] getTask(${taskId}) -> not found`);
    return null;
  }

  console.log(`[TaskService] getTask(${taskId}) -> found`);
  return parseTask(row);
}
