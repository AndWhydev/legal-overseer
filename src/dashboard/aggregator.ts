/**
 * Dashboard data aggregator.
 *
 * Reads directly from the SQLite database to assemble the per-project
 * and fleet-wide views the dashboard renders. Everything here is
 * read-only so the dashboard can never accidentally mutate state.
 */

import { getDatabase } from '../db/connection.js';
import {
  getAllProjects,
  getProjectById,
  type Project,
} from '../db/repositories/projects.js';
import { getById as getTaskById } from '../db/repositories/tasks.js';
import {
  countLessons,
  getLessonsByProject,
  type Lesson,
} from '../db/repositories/lessons.js';
import { getPlaybookStatus } from '../memory/playbook.js';

export type FleetHealth = 'green' | 'amber' | 'red';

export interface ProjectFleetRow {
  project: Project;
  health: FleetHealth;
  pendingTasks: number;
  runningTasks: number;
  iterationsLast24h: number;
  iterationsCap: number;
  lastWorkerStatus: string | null;
  lastWorkerAt: string | null;
  lastEscalationAt: string | null;
  lessonsCount: number;
  costLast24hUsd: number;
}

export interface FleetSummary {
  rows: ProjectFleetRow[];
  totals: {
    projects: number;
    active: number;
    paused: number;
    archived: number;
    pendingTasks: number;
    runningTasks: number;
    lessons: number;
    costLast24hUsd: number;
  };
  generatedAt: string;
}

export interface RecentTaskRow {
  id: string;
  projectId: string | null;
  projectName: string | null;
  skillId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  costUsd: number | null;
}

export interface ProjectDetail {
  project: Project;
  fleetRow: ProjectFleetRow;
  recentTasks: RecentTaskRow[];
  recentLessons: Lesson[];
  playbook: {
    exists: boolean;
    path: string;
    sizeBytes: number;
  };
}

/**
 * Decide the health colour for one project. Rules:
 *  - red    : last 2+ worker tasks failed, or the project is paused
 *             with no recent successful work, or status=archived
 *  - amber  : an escalation in the last 24h, or there's an awaiting
 *             approval task, or any task is currently running while the
 *             daily cap has already been hit
 *  - green  : everything else (active + recent progress, or just idle)
 */
function deriveHealth(p: Project, row: Omit<ProjectFleetRow, 'health'>): FleetHealth {
  if (p.status === 'archived') return 'red';
  if (p.status === 'paused') return 'amber';
  if (row.lastEscalationAt) {
    const ageHrs =
      (Date.now() - new Date(row.lastEscalationAt).getTime()) / (1000 * 60 * 60);
    if (ageHrs <= 24) return 'amber';
  }
  if (row.iterationsLast24h >= row.iterationsCap) return 'amber';
  // Two-in-a-row failure check
  const db = getDatabase();
  const recent = db
    .prepare(
      `SELECT status FROM tasks
       WHERE project_id = ? AND skill_id = 'claude_code_worker'
       ORDER BY created_at DESC LIMIT 2`,
    )
    .all(p.id) as { status: string }[];
  if (recent.length >= 2 && recent.every((r) => r.status === 'failed')) {
    return 'red';
  }
  return 'green';
}

/**
 * Build the fleet summary used by the home page.
 */
export function buildFleetSummary(): FleetSummary {
  const db = getDatabase();
  const projects = getAllProjects();
  const rows: ProjectFleetRow[] = [];

  let totalPending = 0;
  let totalRunning = 0;
  let totalCost = 0;

  for (const p of projects) {
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
         FROM tasks WHERE project_id = ?`,
      )
      .get(p.id) as { pending: number | null; running: number | null };

    const iterRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE project_id = ? AND skill_id = 'claude_code_worker'
           AND created_at > datetime('now', '-24 hours')`,
      )
      .get(p.id) as { n: number };

    const lastWorker = db
      .prepare(
        `SELECT status, COALESCE(completed_at, started_at, created_at) AS at
         FROM tasks
         WHERE project_id = ? AND skill_id = 'claude_code_worker'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(p.id) as { status: string; at: string } | undefined;

    const lastEscalation = db
      .prepare(
        `SELECT created_at FROM tasks
         WHERE project_id = ? AND skill_id = 'overseer_decision'
           AND output_json LIKE '%"action":"escalate"%'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(p.id) as { created_at: string } | undefined;

    // Sum cost from completed worker tasks in the last 24h.
    const costRows = db
      .prepare(
        `SELECT output_json FROM tasks
         WHERE project_id = ? AND skill_id = 'claude_code_worker'
           AND status = 'completed'
           AND completed_at > datetime('now', '-24 hours')`,
      )
      .all(p.id) as { output_json: string }[];
    let costLast24h = 0;
    for (const r of costRows) {
      try {
        const parsed = JSON.parse(r.output_json) as { costUsd?: number };
        if (typeof parsed.costUsd === 'number') costLast24h += parsed.costUsd;
      } catch {
        // ignore unparseable rows
      }
    }
    totalCost += costLast24h;

    const lessonsCount = countLessons(p.id);
    const partial: Omit<ProjectFleetRow, 'health'> = {
      project: p,
      pendingTasks: counts.pending ?? 0,
      runningTasks: counts.running ?? 0,
      iterationsLast24h: iterRow.n,
      iterationsCap: p.max_iterations_per_day,
      lastWorkerStatus: lastWorker?.status ?? null,
      lastWorkerAt: lastWorker?.at ?? null,
      lastEscalationAt: lastEscalation?.created_at ?? null,
      lessonsCount,
      costLast24hUsd: costLast24h,
    };
    rows.push({ ...partial, health: deriveHealth(p, partial) });

    totalPending += partial.pendingTasks;
    totalRunning += partial.runningTasks;
  }

  const statusCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'paused'   THEN 1 ELSE 0 END) AS paused,
         SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
       FROM projects`,
    )
    .get() as { active: number | null; paused: number | null; archived: number | null };

  return {
    rows,
    totals: {
      projects: projects.length,
      active: statusCounts.active ?? 0,
      paused: statusCounts.paused ?? 0,
      archived: statusCounts.archived ?? 0,
      pendingTasks: totalPending,
      runningTasks: totalRunning,
      lessons: countLessons(),
      costLast24hUsd: totalCost,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Per-project deep view used by the detail page.
 */
export function buildProjectDetail(projectId: string): ProjectDetail | null {
  const project = getProjectById(projectId);
  if (!project) return null;

  const fleet = buildFleetSummary();
  const fleetRow = fleet.rows.find((r) => r.project.id === projectId);
  if (!fleetRow) return null;

  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, project_id, skill_id, status, created_at, completed_at, output_json
       FROM tasks
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 25`,
    )
    .all(projectId) as Array<{
      id: string;
      project_id: string;
      skill_id: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      output_json: string | null;
    }>;

  const recentTasks: RecentTaskRow[] = rows.map((r) => {
    let costUsd: number | null = null;
    if (r.output_json) {
      try {
        const parsed = JSON.parse(r.output_json) as { costUsd?: number };
        if (typeof parsed.costUsd === 'number') costUsd = parsed.costUsd;
      } catch {
        // ignore
      }
    }
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: project.name,
      skillId: r.skill_id,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      costUsd,
    };
  });

  return {
    project,
    fleetRow,
    recentTasks,
    recentLessons: getLessonsByProject(projectId, 10),
    playbook: getPlaybookStatus(project),
  };
}

/**
 * Fetch one task with its parsed input/output for the task detail view.
 */
export function getTaskWithParsed(taskId: string): {
  task: ReturnType<typeof getTaskById>;
  inputObj: unknown;
  outputObj: unknown;
} | null {
  const task = getTaskById(taskId);
  if (!task) return null;
  let inputObj: unknown = null;
  let outputObj: unknown = null;
  if (task.input_json) {
    try { inputObj = JSON.parse(task.input_json); } catch { inputObj = task.input_json; }
  }
  if (task.output_json) {
    try { outputObj = JSON.parse(task.output_json); } catch { outputObj = task.output_json; }
  }
  return { task, inputObj, outputObj };
}
