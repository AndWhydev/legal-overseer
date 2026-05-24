/**
 * Task processor — Legal Overseer.
 *
 * Polls the tasks table for pending work, classifies (Haiku), runs
 * the matching legal skill, and wraps every successful output in the
 * three compliance constraints:
 *
 *   1. enqueueForReview — output lands in review_queue (pending).
 *   2. recordAiRun      — billing transparency: time + spend.
 *   3. appendLegalAudit — immutable hash-chained audit entry.
 *
 * The processor never sends anything externally. Outbound channels
 * (SMTP send, court filing) must call assertApproved() against a
 * review_queue row whose status='approved'.
 */

import { getNextPendingTask, markCompleted, markFailed } from '../db/repositories/tasks.js';
import { updateTrustMetrics } from '../db/repositories/trustScores.js';
import { logDecision } from '../db/repositories/decisionTraces.js';
import { bitbitMcpServer } from './tools.js';
import { classifyTask, executeWithSkill } from './coordinator.js';
import { selectModel, type RiskLevel } from './models.js';
import { isValidSkillType } from '../skills/registry.js';
import type { SkillType, TaskClassification } from '../skills/types.js';
import {
  canExecute,
  recordActionResult,
  logAuditSafe,
  logError,
  createSafeLogger,
  type Action,
  type RiskLevel as GovernanceRiskLevel,
} from '../governance/index.js';
import {
  appendLegalAudit,
  enqueueForReview,
  recordAiRun,
  wrapWithDisclaimer,
  type OutputKind,
} from '../compliance/index.js';
import { getMatterById } from '../db/repositories/matters.js';

const logger = createSafeLogger('TaskProcessor');

const OVERSEER_AGENT_ID = 'legal-overseer-v1';

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Map skill type to governance risk level. Every legal skill is at
 * least 'medium' because output may end up in a client / court setting
 * if the review gate is bypassed.
 */
function determineRiskLevel(skillType: string): GovernanceRiskLevel {
  switch (skillType) {
    case 'contract_review':
    case 'legal_research':
      return 'high';
    case 'matter_drafting':
    case 'client_comms':
      return 'high';
    case 'matter_management':
    case 'compliance_monitor':
      return 'medium';
    default:
      return 'medium';
  }
}

/**
 * Map a skill type to the output_kind used in the review queue.
 */
function outputKindFor(skillType: SkillType): OutputKind {
  switch (skillType) {
    case 'contract_review':    return 'contract_review';
    case 'legal_research':     return 'research_memo';
    case 'matter_drafting':    return 'drafted_document';
    case 'client_comms':       return 'client_email';
    case 'matter_management':  return 'matter_management';
    case 'compliance_monitor': return 'regulatory_alert';
    default:                   return 'drafted_document';
  }
}

export async function processNextTask(): Promise<boolean> {
  const task = getNextPendingTask();
  if (!task) return false;

  const input = task.input_json ? JSON.parse(task.input_json) : {};
  const prompt: string = input.prompt || input.query || JSON.stringify(input);
  const inputRiskLevel: RiskLevel = input.risk_level || 'low';
  const matterId: string | null = input.matter_id ?? null;
  const matter = matterId ? getMatterById(matterId) : null;

  let traceId: string | undefined;
  const startedAt = Date.now();

  try {
    logger.info(`Processing task ${task.id}`, {
      prompt: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
      matter: matter?.matter_number ?? '(none)',
    });

    // Skip classification when the caller has already chosen a skill.
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

    const governanceRiskLevel = determineRiskLevel(classification.skillType);

    // Governance gate
    const action: Action = {
      type: `task:${classification.skillType}`,
      riskLevel: governanceRiskLevel,
      agentId: OVERSEER_AGENT_ID,
      skillId: classification.skillType,
      domain: task.skill_id || 'general',
    };
    const allowed = await canExecute(OVERSEER_AGENT_ID, action);
    if (!allowed) {
      logger.warn('Task blocked by governance', { taskId: task.id, skill: classification.skillType });
      markFailed(task.id, 'Blocked by governance controls');
      await logAuditSafe({
        agentId: OVERSEER_AGENT_ID,
        actionType: 'task_blocked',
        actionDetail: `Task ${task.id} blocked by governance (skill: ${classification.skillType})`,
        riskLevel: governanceRiskLevel,
        taskId: task.id,
      });
      return true;
    }

    const modelSelection = selectModel(classification.complexity, inputRiskLevel);

    await logAuditSafe({
      agentId: OVERSEER_AGENT_ID,
      actionType: 'task_classified',
      actionDetail: `Classified as ${classification.skillType} (${classification.complexity})`,
      riskLevel: 'low',
      taskId: task.id,
    });

    await logAuditSafe({
      agentId: OVERSEER_AGENT_ID,
      actionType: 'task_started',
      actionDetail: `Started processing task ${task.id} with ${modelSelection.tier}`,
      riskLevel: governanceRiskLevel,
      taskId: task.id,
    });

    traceId = logDecision({
      taskId: task.id,
      trigger: 'task_processor',
      inputsJson: JSON.stringify({ prompt: prompt.substring(0, 500), matterId }),
      reasoning: classification.reasoning,
      alternativesConsidered: `Skill: ${classification.skillType}, Model: ${modelSelection.tier}`,
      actionTaken: `Execute with ${classification.skillType} using ${modelSelection.tier}`,
    });

    const result = await executeWithSkill(
      prompt,
      classification.skillType,
      { bitbit: bitbitMcpServer },
    );

    if (result.success) {
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

      // ------------------ compliance wrap ------------------
      try {
        const title = (input.title as string)
          || (matter ? `${matter.matter_number} — ${classification.skillType}` : `${classification.skillType} output`);

        const review = enqueueForReview({
          matterId: matter?.id ?? null,
          matterNumber: matter?.matter_number ?? null,
          skillId: classification.skillType,
          outputKind: outputKindFor(classification.skillType),
          title,
          bodyMarkdown: wrapWithDisclaimer(result.output),
          metadata: {
            taskId: task.id,
            complexity: classification.complexity,
            model: modelSelection.tier,
            toolCalls: result.toolCalls,
            reasoning: classification.reasoning,
          },
          costUsd: result.costUsd,
        });

        if (matter) {
          recordAiRun({
            matterId: matter.id,
            skillId: classification.skillType,
            description: title,
            durationSeconds: Math.round((Date.now() - startedAt) / 1000),
            costUsd: result.costUsd ?? 0,
            reviewId: review.id,
            taskId: task.id,
          });
        }
      } catch (wrapErr) {
        // Compliance wrapping failure is itself an audit event — we
        // don't fail the task (the output is already saved on the
        // task row) but we make the failure loud.
        const m = wrapErr instanceof Error ? wrapErr.message : String(wrapErr);
        logger.error(`compliance wrap failed for task ${task.id}: ${m}`);
        appendLegalAudit({
          matterId: matter?.id ?? null,
          actorId: `skill:${classification.skillType}`,
          action: 'compliance.wrap_failed',
          detail: m,
          refTable: 'tasks',
          refId: task.id,
          metadata: null,
        });
      }
      // ----------------- /compliance wrap ------------------

      updateTrustMetrics(
        OVERSEER_AGENT_ID,
        classification.skillType,
        task.skill_id || 'general',
        true,
        false,
      );

      recordActionResult(OVERSEER_AGENT_ID, `task:${classification.skillType}`, true);

      await logAuditSafe({
        agentId: OVERSEER_AGENT_ID,
        actionType: 'task_completed',
        actionDetail: `Task ${task.id} completed successfully`,
        riskLevel: governanceRiskLevel,
        taskId: task.id,
      });

      logger.info(`Task ${task.id} completed`, {
        skill: classification.skillType,
        model: modelSelection.tier,
        cost: result.costUsd?.toFixed(4),
      });
    } else {
      const errorMsg = result.error || 'Unknown agent error';
      markFailed(task.id, errorMsg);

      updateTrustMetrics(
        OVERSEER_AGENT_ID,
        classification.skillType,
        task.skill_id || 'general',
        false,
        false,
      );

      recordActionResult(OVERSEER_AGENT_ID, `task:${classification.skillType}`, false);

      await logAuditSafe({
        agentId: OVERSEER_AGENT_ID,
        actionType: 'task_failed',
        actionDetail: `Task ${task.id} failed: ${errorMsg}`,
        riskLevel: 'medium',
        taskId: task.id,
      });

      logger.error(`Task ${task.id} failed`, { error: errorMsg });
    }

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    markFailed(task.id, errorMsg);

    updateTrustMetrics(
      OVERSEER_AGENT_ID,
      task.skill_id || 'general',
      task.skill_id || 'general',
      false,
      false,
    );

    await logAuditSafe({
      agentId: OVERSEER_AGENT_ID,
      actionType: 'task_failed',
      actionDetail: `Task ${task.id} threw exception: ${errorMsg}`,
      riskLevel: 'medium',
      taskId: task.id,
    });

    logError(error instanceof Error ? error : new Error(errorMsg), `Task ${task.id}`);
    return true;
  }
}

export function startTaskLoop(intervalMs: number = 5000): void {
  if (intervalId) {
    logger.info('Task processor already running');
    return;
  }
  logger.info(`Task processor started (polling every ${intervalMs}ms)`);
  logAuditSafe({
    agentId: OVERSEER_AGENT_ID,
    actionType: 'processor_started',
    actionDetail: `Task processor started with ${intervalMs}ms interval`,
    riskLevel: 'low',
  });
  intervalId = setInterval(async () => {
    try {
      await processNextTask();
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'Task processor loop');
    }
  }, intervalMs);
}

export function stopTaskLoop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Task processor stopped');
    logAuditSafe({
      agentId: OVERSEER_AGENT_ID,
      actionType: 'processor_stopped',
      actionDetail: 'Task processor stopped gracefully',
      riskLevel: 'low',
    });
  }
}

export function isProcessorRunning(): boolean {
  return intervalId !== null;
}
