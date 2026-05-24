/**
 * Overseer loop — Legal Overseer.
 *
 * The reactive processor in processor.ts pulls pending tasks. This
 * loop runs the other direction: it walks every open matter on a
 * schedule and proactively decides what (if anything) the next AI
 * cycle should do.
 *
 * Per tick, for each open matter:
 *   1. Refresh deadlines via the matter_management skill (cheap path:
 *      only re-run if it's been > MATTER_REVIEW_DAYS since the last
 *      run for that matter).
 *   2. For any deadline due within REMINDER_WINDOW_DAYS and not yet
 *      reminded, enqueue a client_comms reminder task.
 *   3. Log the decision via decisionTraces + legal_audit_log.
 *
 * The loop never sends external messages — every reminder it
 * generates lands in the review_queue for the responsible lawyer to
 * approve before any client sees it.
 */

import { createSafeLogger } from '../governance/index.js';
import {
  listMatters,
  type Matter,
} from '../db/repositories/matters.js';
import {
  listDeadlinesForMatter,
  markReminded,
  type Deadline,
} from '../db/repositories/deadlines.js';
import { createTask, getById } from '../db/repositories/tasks.js';
import { logDecision } from '../db/repositories/decisionTraces.js';
import { appendLegalAudit } from '../compliance/audit.js';

const logger = createSafeLogger('OverseerLoop');

const OVERSEER_AGENT_ID = 'legal-overseer-v1';

const REMINDER_WINDOW_DAYS = 14;

let intervalId: ReturnType<typeof setInterval> | null = null;

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400_000);
}

/**
 * One pass over every open matter. Returns the count of reminder
 * tasks enqueued so the caller / test can assert what happened.
 */
export function runOverseerTick(): { remindersDispatched: number } {
  const matters = listMatters('open');
  let remindersDispatched = 0;
  logger.info(`Overseer tick: ${matters.length} open matters`);

  for (const matter of matters) {
    const deadlines = listDeadlinesForMatter(matter.id);
    const open = deadlines.filter((d) => d.status === 'open');
    for (const d of open) {
      const days = daysFromNow(d.due_date);
      if (days < 0 || days > REMINDER_WINDOW_DAYS) continue;

      const enqueued = enqueueReminder(matter, d);
      if (enqueued) {
        markReminded(d.id);
        remindersDispatched++;
      }
    }
  }
  return { remindersDispatched };
}

function enqueueReminder(matter: Matter, deadline: Deadline): boolean {
  const inputJson = JSON.stringify({
    prompt: `Draft a deadline reminder for the responsible lawyer on matter ${matter.matter_number}: ${deadline.description}. Due ${deadline.due_date} (${daysFromNow(deadline.due_date)} days). Basis: ${deadline.jurisdiction_basis ?? 'unspecified'}. Recommended action: ${deadline.recommended_action ?? 'unspecified'}.`,
    matter_id: matter.id,
    matter_number: matter.matter_number,
    deadline_id: deadline.id,
    deadline_type: deadline.deadline_type,
    title: `Reminder: ${matter.matter_number} — ${deadline.description}`,
    complexity: 'simple',
  });

  // Matter id is encoded in input_json (matter_id field); we don't
  // pass it as the tasks.project_id FK because the projects table is
  // unused under Legal Overseer.
  const task = createTask(
    'client_comms',
    'overseer',
    inputJson,
    undefined,
    undefined,
  );

  logDecision({
    taskId: task.id,
    trigger: 'overseer_loop',
    inputsJson: JSON.stringify({
      matter: matter.matter_number,
      deadline: deadline.description,
      dueDate: deadline.due_date,
    }),
    reasoning: `Deadline within ${REMINDER_WINDOW_DAYS} days; dispatching reminder draft.`,
    actionTaken: `Enqueued reminder client_comms task ${task.id}`,
  });

  appendLegalAudit({
    matterId: matter.id,
    actorId: OVERSEER_AGENT_ID,
    action: 'overseer.reminder_dispatched',
    detail: `Reminder for ${deadline.description} (due ${deadline.due_date})`,
    refTable: 'tasks',
    refId: task.id,
    metadata: { deadlineId: deadline.id, daysRemaining: daysFromNow(deadline.due_date) },
  });

  logger.info(`Overseer: matter ${matter.matter_number} → reminder task ${task.id} (${deadline.description})`);
  return true;
}

export function startOverseerLoop(intervalMs: number = 600_000): void {
  if (intervalId) {
    logger.info('Overseer loop already running');
    return;
  }
  logger.info(`Overseer loop started (interval ${intervalMs}ms)`);
  intervalId = setInterval(() => {
    try {
      runOverseerTick();
    } catch (err) {
      logger.error(`Overseer tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, intervalMs);
}

export function stopOverseerLoop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Overseer loop stopped');
  }
}

export function isOverseerLoopRunning(): boolean {
  return intervalId !== null;
}

// Helper for the dispatch script — fetch a task by id.
export { getById as getTaskById };
