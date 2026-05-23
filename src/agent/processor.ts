/**
 * Task processor module for BitBit
 *
 * Provides the main task processing loop that reads pending tasks from
 * the database, classifies them with Haiku, selects the appropriate model,
 * executes via skill routing, and updates task state with results.
 *
 * Implements the Plan-and-Execute pattern:
 * 1. Check control plane (governance gate)
 * 2. Classify task with Haiku (cheap)
 * 3. Select model based on complexity and risk
 * 4. Execute with appropriate skill and model
 * 5. Update trust scores and log all decisions
 */

import { getNextPendingTask, markCompleted, markFailed } from '../db/repositories/tasks.js';
import { updateTrustMetrics } from '../db/repositories/trustScores.js';
import { logDecision } from '../db/repositories/decisionTraces.js';
import { bitbitMcpServer } from './tools.js';
import { classifyTask, executeWithSkill } from './coordinator.js';
import { selectModel, type RiskLevel } from './models.js';
import type { ClaudeCodeWorkerInput } from '../skills/claude-code-worker/index.js';
import { isValidSkillType } from '../skills/registry.js';
import type { SkillType, TaskClassification } from '../skills/types.js';
import { generateLessonFromTask } from '../memory/lessons.js';
import {
  canExecute,
  recordActionResult,
  logAuditSafe,
  logError,
  createSafeLogger,
  type Action,
  type RiskLevel as GovernanceRiskLevel,
} from '../governance/index.js';

const logger = createSafeLogger('TaskProcessor');

/**
 * Agent identifier for audit logging
 */
const BITBIT_AGENT_ID = 'bitbit-core-v1';

/**
 * Interval handle for the task processing loop
 */
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Map skill type to governance risk level
 */
function determineRiskLevel(skillType: string, actionType?: string): GovernanceRiskLevel {
  // Payment-related operations are critical
  if (skillType === 'ops_officer' && actionType?.includes('payment')) {
    return 'critical';
  }

  // Content approval is high risk (publishing decisions)
  if (skillType === 'gatekeeper' && actionType?.includes('approve')) {
    return 'high';
  }

  // Skill-level defaults
  switch (skillType) {
    case 'ops_officer':
      return 'high';
    case 'gatekeeper':
      return 'medium';
    case 'rd_scout':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Process the next pending task from the database
 *
 * Fetches the next pending task, checks governance, classifies with Haiku,
 * selects the appropriate model, executes via skill routing, and updates
 * the task state. Logs audit events and decision traces.
 *
 * @returns true if a task was processed, false if no pending tasks
 */
export async function processNextTask(): Promise<boolean> {
  const task = getNextPendingTask();

  if (!task) {
    return false;
  }

  // Parse input_json to get the prompt and risk level
  const input = task.input_json ? JSON.parse(task.input_json) : {};
  const prompt = input.prompt || input.query || JSON.stringify(input);
  const inputRiskLevel: RiskLevel = input.risk_level || 'low';

  let traceId: string | undefined;

  try {
    // 1. Classify task with Haiku (cheap)
    logger.info(`Processing task ${task.id}`, {
      prompt: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
    });

    // Skip classification when the caller has already chosen a skill.
    // The overseer loop and direct project dispatch always supply skill_id
    // and (for workers) project_id in input_json, so paying for a Haiku
    // classification round would be wasted.
    const preselectedSkill: SkillType | null =
      task.skill_id && isValidSkillType(task.skill_id) ? task.skill_id : null;

    const classification: TaskClassification = preselectedSkill
      ? {
          skillType: preselectedSkill,
          complexity: (input.complexity as TaskClassification['complexity']) || 'standard',
          requiredTools: [],
          reasoning: 'Skill preselected by caller (no classification needed)',
        }
      : await classifyTask(prompt);

    // 2. Determine governance risk level
    const governanceRiskLevel = determineRiskLevel(
      classification.skillType,
      input.action_type
    );

    // 3. Check control plane (governance gate)
    const action: Action = {
      type: `task:${classification.skillType}`,
      riskLevel: governanceRiskLevel,
      agentId: BITBIT_AGENT_ID,
      skillId: classification.skillType,
      domain: task.skill_id || 'general',
    };

    const allowed = await canExecute(BITBIT_AGENT_ID, action);

    if (!allowed) {
      logger.warn('Task blocked by governance', {
        taskId: task.id,
        skill: classification.skillType,
        riskLevel: governanceRiskLevel,
      });

      markFailed(task.id, 'Blocked by governance controls');

      await logAuditSafe({
        agentId: BITBIT_AGENT_ID,
        actionType: 'task_blocked',
        actionDetail: `Task ${task.id} blocked by governance (skill: ${classification.skillType}, risk: ${governanceRiskLevel})`,
        riskLevel: governanceRiskLevel,
        taskId: task.id,
      });

      return true;
    }

    // 4. Select model based on complexity and risk
    const modelSelection = selectModel(classification.complexity, inputRiskLevel);

    // Log classification decision
    await logAuditSafe({
      agentId: BITBIT_AGENT_ID,
      actionType: 'task_classified',
      actionDetail: `Classified as ${classification.skillType} (${classification.complexity})`,
      riskLevel: 'low',
      taskId: task.id,
      inputHash: JSON.stringify({
        skill: classification.skillType,
        complexity: classification.complexity,
        model: modelSelection.tier,
        reason: modelSelection.reason,
        reasoning: classification.reasoning,
      }).substring(0, 128),
    });

    // Log task started
    await logAuditSafe({
      agentId: BITBIT_AGENT_ID,
      actionType: 'task_started',
      actionDetail: `Started processing task ${task.id} with ${modelSelection.tier}`,
      riskLevel: governanceRiskLevel,
      taskId: task.id,
      inputHash: prompt.substring(0, 64),
    });

    // Log decision trace for learning
    traceId = logDecision({
      taskId: task.id,
      trigger: 'task_processor',
      inputsJson: JSON.stringify({ prompt: prompt.substring(0, 500), riskLevel: governanceRiskLevel }),
      reasoning: classification.reasoning,
      alternativesConsidered: `Skills: ${classification.skillType}, Model: ${modelSelection.tier} (${modelSelection.reason})`,
      actionTaken: `Execute with ${classification.skillType} skill using ${modelSelection.tier}`,
    });

    // 5. Execute with skill-specific routing
    // For claude_code_worker, build the worker input from input_json + the
    // task's project_id column rather than re-parsing the prompt as JSON.
    let workerInput: ClaudeCodeWorkerInput | undefined;
    if (classification.skillType === 'claude_code_worker') {
      const projectId = (input.project_id as string) || task.project_id || null;
      if (!projectId) {
        markFailed(task.id, 'claude_code_worker task missing project_id');
        return true;
      }
      workerInput = {
        project_id: projectId,
        prompt: input.prompt || prompt,
        model_tier: input.model_tier,
        allowed_tools: input.allowed_tools,
        max_budget_usd: input.max_budget_usd,
        timeout_ms: input.timeout_ms,
        extra_context: input.extra_context,
      };
    }

    const result = await executeWithSkill(
      prompt,
      classification.skillType,
      { bitbit: bitbitMcpServer },
      workerInput,
    );

    if (result.success) {
      // Mark task as completed
      const outputJson = JSON.stringify({
        output: result.output,
        toolCalls: result.toolCalls,
        costUsd: result.costUsd,
        classification: {
          skill: classification.skillType,
          complexity: classification.complexity,
          model: modelSelection.tier,
        },
      });

      markCompleted(task.id, outputJson);

      // Extract a lesson from this worker cycle (best-effort, async).
      // Only worker tasks produce lessons; the generator no-ops for
      // other skill types.
      if (classification.skillType === 'claude_code_worker') {
        generateLessonFromTask(task.id).catch((err) => {
          logger.warn(
            `lesson generation failed for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      // Update trust metrics (success)
      updateTrustMetrics(
        BITBIT_AGENT_ID,
        classification.skillType,
        task.skill_id || 'general',
        true,
        false
      );

      // Record action result for anomaly tracking
      recordActionResult(BITBIT_AGENT_ID, `task:${classification.skillType}`, true);

      // Log task completed
      await logAuditSafe({
        agentId: BITBIT_AGENT_ID,
        actionType: 'task_completed',
        actionDetail: `Task ${task.id} completed successfully`,
        riskLevel: governanceRiskLevel,
        taskId: task.id,
        outputHash: result.output.substring(0, 64),
      });

      logger.info(`Task ${task.id} completed`, {
        skill: classification.skillType,
        model: modelSelection.tier,
        cost: result.costUsd?.toFixed(4),
      });
    } else {
      // Agent returned failure
      const errorMsg = result.error || 'Unknown agent error';
      markFailed(task.id, errorMsg);

      // Learn from failure too — Opus often distills "don't do X" lessons
      // that are more valuable than success summaries.
      if (classification.skillType === 'claude_code_worker') {
        generateLessonFromTask(task.id).catch((err) => {
          logger.warn(
            `lesson generation (failure) failed for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      // Update trust metrics (failure)
      updateTrustMetrics(
        BITBIT_AGENT_ID,
        classification.skillType,
        task.skill_id || 'general',
        false,
        false
      );

      // Record action result for anomaly tracking
      recordActionResult(BITBIT_AGENT_ID, `task:${classification.skillType}`, false);

      // Log task failed
      await logAuditSafe({
        agentId: BITBIT_AGENT_ID,
        actionType: 'task_failed',
        actionDetail: `Task ${task.id} failed: ${errorMsg}`,
        riskLevel: 'medium',
        taskId: task.id,
      });

      logger.error(`Task ${task.id} failed`, { error: errorMsg });
    }

    return true;
  } catch (error) {
    // Execution threw an exception
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    markFailed(task.id, errorMsg);

    // Update trust metrics (failure)
    updateTrustMetrics(
      BITBIT_AGENT_ID,
      task.skill_id || 'general',
      task.skill_id || 'general',
      false,
      false
    );

    // Log task failed
    await logAuditSafe({
      agentId: BITBIT_AGENT_ID,
      actionType: 'task_failed',
      actionDetail: `Task ${task.id} threw exception: ${errorMsg}`,
      riskLevel: 'medium',
      taskId: task.id,
    });

    logError(error instanceof Error ? error : new Error(errorMsg), `Task ${task.id}`);

    return true;
  }
}

/**
 * Start the task processing loop
 *
 * Polls for pending tasks at the specified interval and processes
 * one task per iteration. Uses setInterval for non-blocking polling.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 5000)
 */
export function startTaskLoop(intervalMs: number = 5000): void {
  if (intervalId) {
    logger.info('Task processor already running');
    return;
  }

  logger.info(`Task processor started (polling every ${intervalMs}ms)`);

  // Log startup audit event
  logAuditSafe({
    agentId: BITBIT_AGENT_ID,
    actionType: 'processor_started',
    actionDetail: `Task processor started with ${intervalMs}ms interval`,
    riskLevel: 'low',
  });

  intervalId = setInterval(async () => {
    try {
      await processNextTask();
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'Task processor loop'
      );
    }
  }, intervalMs);
}

/**
 * Stop the task processing loop
 *
 * Gracefully stops the polling interval. Safe to call even if
 * the processor is not running.
 */
export function stopTaskLoop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;

    logger.info('Task processor stopped');

    // Log shutdown audit event
    logAuditSafe({
      agentId: BITBIT_AGENT_ID,
      actionType: 'processor_stopped',
      actionDetail: 'Task processor stopped gracefully',
      riskLevel: 'low',
    });
  }
}

/**
 * Check if the task processor is currently running
 *
 * @returns true if the processor is running
 */
export function isProcessorRunning(): boolean {
  return intervalId !== null;
}
