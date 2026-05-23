/**
 * Overseer loop.
 *
 * The reactive processor in processor.ts pulls pending tasks. This loop
 * runs the *other* direction: it walks active projects on a schedule and
 * proactively decides what (if anything) the next worker cycle should
 * do for each one.
 *
 * Per tick, for each active project:
 *   1. Snapshot the project's filesystem state (git status, presence of
 *      STATE.md / ROADMAP.md / PLAYBOOK.md, recent worker output).
 *   2. Check the per-project iteration cap so we don't burn budget on
 *      one project all day.
 *   3. Ask Opus: "given this state, what should the worker do next, if
 *      anything?" Opus must answer one of:
 *        - {"action": "dispatch", "prompt": "..."}      → enqueue a worker task
 *        - {"action": "wait", "reason": "..."}          → no-op for this tick
 *        - {"action": "escalate", "reason": "..."}      → flag for human (Stage 4)
 *   4. Log the decision via decisionTraces so we can learn from it.
 *
 * Workers themselves still execute on Sonnet (via the worker skill's
 * defaultModel). Opus is the brain that decides *what* to do; Sonnet is
 * the hands that do it.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../governance/index.js';
import {
  getActiveProjects,
  touchActivity,
  type Project,
} from '../db/repositories/projects.js';
import {
  createTask,
  getById,
  markCompleted,
} from '../db/repositories/tasks.js';
import { logDecision } from '../db/repositories/decisionTraces.js';
import { getDatabase } from '../db/connection.js';
import { MODELS } from './models.js';
import { recallLessonsForPrompt } from '../memory/lessons.js';

const logger = createSafeLogger('OverseerLoop');

const OVERSEER_AGENT_ID = 'overseer-v1';

/** State files the overseer reads to inform decisions. Order matters: */
const STATE_FILES = ['STATE.md', 'ROADMAP.md', 'PLAYBOOK.md', 'TODO.md'];

/**
 * Snapshot of a project at the moment of an overseer decision.
 */
export interface ProjectSnapshot {
  project: Project;
  /** Output of `git status --short`, or null if not a git repo */
  gitStatus: string | null;
  /** Output of `git log --oneline -n 5` */
  recentCommits: string | null;
  /** First ~2000 chars of any state file found in the project root */
  stateFile: { name: string; preview: string } | null;
  /** Iterations used in the last 24h (capped tasks count) */
  iterationsLast24h: number;
  /** Whether the per-day cap has been hit */
  iterationCapReached: boolean;
  /** Most recent worker task summary, if any */
  lastWorker: {
    taskId: string;
    status: string;
    summary: string;
    completedAt: string | null;
  } | null;
}

/**
 * The overseer's structured decision for one project this tick.
 */
export type OverseerDecision =
  | { action: 'dispatch'; prompt: string; reasoning: string }
  | { action: 'wait'; reason: string }
  | { action: 'escalate'; reason: string };

/**
 * Result of one tick across all active projects.
 */
export interface OverseerTickResult {
  ticks: Array<{
    projectId: string;
    projectName: string;
    decision: OverseerDecision;
    enqueuedTaskId?: string;
    error?: string;
  }>;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/**
 * Read up to ~2000 chars of the first state file found in the project.
 */
function readStateFile(projectPath: string): { name: string; preview: string } | null {
  for (const name of STATE_FILES) {
    const path = join(projectPath, name);
    if (!existsSync(path)) continue;
    try {
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      const text = readFileSync(path, 'utf8');
      return { name, preview: text.slice(0, 2000) };
    } catch {
      // ignore — surface as no state file
    }
  }
  return null;
}

/**
 * Run a short git command in the project directory. Returns null if
 * the directory isn't a git repo or the command fails.
 */
function safeGit(cwd: string, args: string[]): string | null {
  try {
    const out = execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Count worker iterations for this project in the last 24h (any status
 * — pending/running/completed all count toward the daily cap).
 */
function countIterationsLast24h(projectId: string): number {
  const db = getDatabase();
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM tasks
      WHERE project_id = ?
        AND skill_id = 'claude_code_worker'
        AND created_at > datetime('now', '-24 hours')
      `,
    )
    .get(projectId) as { n: number };
  return row.n;
}

/**
 * Fetch the most recent worker task for a project so the overseer can
 * see what its last cycle did.
 */
function getLastWorker(projectId: string): ProjectSnapshot['lastWorker'] {
  const db = getDatabase();
  const row = db
    .prepare(
      `
      SELECT id, status, output_json, completed_at
      FROM tasks
      WHERE project_id = ? AND skill_id = 'claude_code_worker'
      ORDER BY created_at DESC
      LIMIT 1
      `,
    )
    .get(projectId) as
    | { id: string; status: string; output_json: string | null; completed_at: string | null }
    | undefined;

  if (!row) return null;

  let summary = '(no output)';
  if (row.output_json) {
    try {
      const parsed = JSON.parse(row.output_json) as { output?: string };
      summary = (parsed.output ?? row.output_json).slice(0, 800);
    } catch {
      summary = row.output_json.slice(0, 800);
    }
  }

  return {
    taskId: row.id,
    status: row.status,
    summary,
    completedAt: row.completed_at,
  };
}

/**
 * Build a ProjectSnapshot for one project.
 */
export function snapshotProject(project: Project): ProjectSnapshot {
  const iterationsLast24h = countIterationsLast24h(project.id);
  return {
    project,
    gitStatus: safeGit(project.path, ['status', '--short']),
    recentCommits: safeGit(project.path, ['log', '--oneline', '-n', '5']),
    stateFile: readStateFile(project.path),
    iterationsLast24h,
    iterationCapReached: iterationsLast24h >= project.max_iterations_per_day,
    lastWorker: getLastWorker(project.id),
  };
}

/**
 * System prompt for the Opus judgment call.
 */
const OVERSEER_SYSTEM_PROMPT = `You are the Overseer for a fleet of dev projects.

For each tick you receive a snapshot of one project: its git status, recent commits, any state/roadmap file, and what the last worker cycle did. Your job is to decide what (if anything) the next headless Claude Code worker cycle should do for this project.

You must respond with exactly one JSON object and nothing else:

{"action": "dispatch", "prompt": "<concrete task for the worker to do>", "reasoning": "<why this is the right next step>"}
  → enqueues a worker task with this prompt.

{"action": "wait", "reason": "<why no action is needed right now>"}
  → no-op for this tick.

{"action": "escalate", "reason": "<what specifically needs human input>"}
  → flag for human review; do not dispatch a worker.

Judgment rules:
- If the last worker reported a blocker, the last 2+ workers made no progress, or the project is asking a question, escalate.
- If git is clean, there's nothing in any state file pointing at clear next work, and the last worker completed cleanly: wait.
- If there is obvious next work (failing tests, an explicit TODO/STATE.md entry, an in-progress branch with uncommitted changes), dispatch with a tight, specific prompt that names files and the verification criterion.
- Worker prompts must be a single concrete step — not a backlog. The worker is one cycle; you'll see it again next tick.
- Never invent work just to look busy. \`wait\` is a valid and often correct answer.`;

function buildSnapshotPrompt(s: ProjectSnapshot): string {
  const parts: string[] = [
    `# Project: ${s.project.name}`,
    `Path: ${s.project.path}`,
    `Priority: ${s.project.priority}`,
    `Iterations in last 24h: ${s.iterationsLast24h} / ${s.project.max_iterations_per_day}`,
    s.project.notes ? `Notes: ${s.project.notes}` : '',
  ].filter(Boolean);

  parts.push('\n## git status --short');
  parts.push(s.gitStatus === null ? '(not a git repo)' : (s.gitStatus || '(clean)'));

  if (s.recentCommits) {
    parts.push('\n## recent commits');
    parts.push(s.recentCommits);
  }

  if (s.stateFile) {
    parts.push(`\n## ${s.stateFile.name} (first 2000 chars)`);
    parts.push(s.stateFile.preview);
  } else {
    parts.push('\n## state files');
    parts.push('(no STATE.md / ROADMAP.md / PLAYBOOK.md / TODO.md found)');
  }

  if (s.lastWorker) {
    parts.push(`\n## last worker (${s.lastWorker.status}, completed=${s.lastWorker.completedAt ?? 'n/a'})`);
    parts.push(s.lastWorker.summary);
  } else {
    parts.push('\n## last worker');
    parts.push('(no prior worker cycles)');
  }

  parts.push('\nWhat should the next worker cycle do, if anything?');
  return parts.join('\n');
}

/**
 * Parse the Opus response. Tolerates leading/trailing whitespace and
 * accidental markdown fences.
 */
function parseDecision(raw: string): OverseerDecision | { error: string; raw: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { error: 'no JSON in response', raw };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), raw };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { error: 'response is not an object', raw };
  }

  const obj = parsed as Record<string, unknown>;
  const action = obj.action;

  if (action === 'dispatch') {
    if (typeof obj.prompt !== 'string' || !obj.prompt.trim()) {
      return { error: 'dispatch missing prompt', raw };
    }
    return {
      action: 'dispatch',
      prompt: obj.prompt,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    };
  }
  if (action === 'wait') {
    return { action: 'wait', reason: typeof obj.reason === 'string' ? obj.reason : '' };
  }
  if (action === 'escalate') {
    return { action: 'escalate', reason: typeof obj.reason === 'string' ? obj.reason : '' };
  }

  return { error: `unknown action: ${String(action)}`, raw };
}

/**
 * Ask Opus what the worker should do for one project. Budget is kept
 * small because this is a single short judgment call.
 */
async function askOverseer(snapshot: ProjectSnapshot): Promise<OverseerDecision | { error: string; raw: string }> {
  const fullPrompt = `${OVERSEER_SYSTEM_PROMPT}\n\n---\n\n${buildSnapshotPrompt(snapshot)}`;

  let raw = '';
  for await (const msg of query({
    prompt: fullPrompt,
    options: {
      model: MODELS.opus,
      maxTurns: 1,
      maxBudgetUsd: 0.25,
    },
  })) {
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as { type?: string }).type === 'result' &&
      (msg as { subtype?: string }).subtype === 'success'
    ) {
      raw = (msg as { result?: string }).result ?? '';
    }
  }

  if (!raw) return { error: 'overseer returned no result', raw: '' };
  return parseDecision(raw);
}

/**
 * Process one project for this tick: snapshot, decide, optionally enqueue.
 */
async function tickProject(project: Project): Promise<OverseerTickResult['ticks'][number]> {
  const snapshot = snapshotProject(project);

  // Cap check first — never even ask Opus if we've already burned through
  // the project's iteration budget for today.
  if (snapshot.iterationCapReached) {
    logger.info(`Project ${project.name} hit daily cap (${snapshot.iterationsLast24h}/${project.max_iterations_per_day}); waiting`);
    return {
      projectId: project.id,
      projectName: project.name,
      decision: {
        action: 'wait',
        reason: `Daily iteration cap reached (${snapshot.iterationsLast24h}/${project.max_iterations_per_day})`,
      },
    };
  }

  const decisionOrErr = await askOverseer(snapshot);
  if ('error' in decisionOrErr) {
    logger.error(`Overseer judgment failed for ${project.name}: ${decisionOrErr.error}`);
    return {
      projectId: project.id,
      projectName: project.name,
      decision: { action: 'wait', reason: `overseer parse error: ${decisionOrErr.error}` },
      error: decisionOrErr.error,
    };
  }

  const decision = decisionOrErr;

  // Persist the decision regardless of action so we can learn from it.
  // Use a synthetic task id (the project id) since wait/escalate don't
  // create real tasks.
  const inputsJson = JSON.stringify({
    project: project.name,
    path: project.path,
    iterationsLast24h: snapshot.iterationsLast24h,
    cap: project.max_iterations_per_day,
    hasStateFile: snapshot.stateFile !== null,
    gitDirty: snapshot.gitStatus !== null && snapshot.gitStatus.length > 0,
  });

  if (decision.action === 'dispatch') {
    // Recall lessons that apply to this project + prompt, inject as
    // extra_context so the worker has prior knowledge before starting.
    const lessons = recallLessonsForPrompt(project.id, decision.prompt, 5);
    const taskInputJson = JSON.stringify({
      project_id: project.id,
      prompt: decision.prompt,
      ...(lessons ? { extra_context: lessons } : {}),
    });
    const task = createTask(
      'claude_code_worker',
      'overseer',
      taskInputJson,
      undefined,
      project.id,
    );

    logDecision({
      taskId: task.id,
      trigger: 'overseer_loop',
      inputsJson,
      reasoning: decision.reasoning,
      actionTaken: `dispatch worker: ${decision.prompt.slice(0, 200)}`,
    });

    touchActivity(project.id);
    logger.info(`Project ${project.name}: dispatched worker task ${task.id}`);
    return {
      projectId: project.id,
      projectName: project.name,
      decision,
      enqueuedTaskId: task.id,
    };
  }

  // For wait/escalate, materialize the decision as a completed
  // 'overseer_decision' task. This keeps decision_traces referentially
  // intact (its task_id has a FK to tasks.id) and gives us a coherent
  // per-project history of every tick — not just the ones that
  // dispatched work.
  const decisionTask = createTask(
    'overseer_decision',
    'overseer',
    inputsJson,
    undefined,
    project.id,
  );
  markCompleted(
    decisionTask.id,
    JSON.stringify({
      action: decision.action,
      reason: decision.reason,
      snapshot: {
        gitDirty: snapshot.gitStatus !== null && snapshot.gitStatus.length > 0,
        hasStateFile: snapshot.stateFile !== null,
        iterationsLast24h: snapshot.iterationsLast24h,
      },
    }),
  );
  logDecision({
    taskId: decisionTask.id,
    trigger: 'overseer_loop',
    inputsJson,
    reasoning: decision.reason,
    actionTaken: decision.action,
  });

  logger.info(`Project ${project.name}: ${decision.action} (${('reason' in decision ? decision.reason : '').slice(0, 80)})`);

  // Escalation surfacing: email the operator. Best-effort — failures
  // here are logged but don't crash the tick. The decision is already
  // persisted to the database regardless of whether the email lands.
  if (decision.action === 'escalate') {
    try {
      const { sendEscalation } = await import('../email/notifier.js');
      await sendEscalation(project, decision.reason);
    } catch (err) {
      logger.error(
        `escalation notify failed for ${project.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { projectId: project.id, projectName: project.name, decision };
}

/**
 * Run one full overseer tick across all active projects.
 */
export async function runOverseerTick(): Promise<OverseerTickResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const projects = getActiveProjects();
  logger.info(`Overseer tick over ${projects.length} active project(s)`);

  const ticks: OverseerTickResult['ticks'] = [];
  for (const project of projects) {
    try {
      ticks.push(await tickProject(project));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Tick crashed for project ${project.name}: ${msg}`);
      ticks.push({
        projectId: project.id,
        projectName: project.name,
        decision: { action: 'wait', reason: `tick crashed: ${msg}` },
        error: msg,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  logger.info(`Overseer tick complete in ${durationMs}ms`);
  return { ticks, startedAt, finishedAt, durationMs };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the overseer on a recurring schedule.
 *
 * @param intervalMs - How often to tick (default: 10 min)
 */
export function startOverseerLoop(intervalMs = 10 * 60 * 1000): void {
  if (intervalHandle) {
    logger.info('Overseer loop already running');
    return;
  }

  logger.info(`Starting overseer loop (every ${Math.round(intervalMs / 1000)}s)`);

  // Kick off an immediate tick so startup work isn't blocked by the
  // first interval delay.
  void runOverseerTick().catch((err) => {
    logger.error(`Initial overseer tick failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  intervalHandle = setInterval(() => {
    void runOverseerTick().catch((err) => {
      logger.error(`Overseer tick failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, intervalMs);
}

/**
 * Stop the recurring overseer loop. Safe to call when not running.
 */
export function stopOverseerLoop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Overseer loop stopped');
  }
}

/**
 * Is the recurring overseer loop active?
 */
export function isOverseerRunning(): boolean {
  return intervalHandle !== null;
}

// Re-export the agent id constant for use by callers (e.g. processor).
export { OVERSEER_AGENT_ID };

// Helper for the dispatch script — fetch a task by id.
export { getById as getTaskById };
