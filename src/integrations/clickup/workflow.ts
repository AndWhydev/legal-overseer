/**
 * ClickUp Task Workflow Module for BitBit
 *
 * Coordinates ClickUp updates with local task state management.
 * Provides complete workflows for agent-processed tasks.
 */

import { postQAReport, updateTaskStatus } from './service.js';
import { type QAReport, QA_STATUS_MAP } from './types.js';
import { markCompleted, markFailed } from '../../db/repositories/tasks.js';
import { logAuditEvent } from '../../db/repositories/audit.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ClickUpWorkflow');

/**
 * Result of completing a Gatekeeper task
 */
export interface GatekeeperCompletionResult {
  success: boolean;
  commentPosted: boolean;
  statusUpdated: boolean;
  localTaskUpdated: boolean;
  error?: string;
}

/**
 * Complete a Gatekeeper task by posting results to ClickUp and updating local state
 *
 * This workflow:
 * 1. Posts the QA report as a comment on the ClickUp task
 * 2. Updates the ClickUp task status based on recommendation
 * 3. Marks the local task as completed
 * 4. Logs an audit entry for the completion
 *
 * Handles partial failures gracefully - if ClickUp operations fail,
 * the local task is still marked as failed with error details.
 *
 * @param dbTaskId - Local database task ID
 * @param clickUpTaskId - ClickUp task ID to update
 * @param report - QA report from Gatekeeper analysis
 * @returns Completion result with status of each operation
 *
 * @example
 * ```typescript
 * const result = await completeGatekeeperTask(
 *   'db-task-123',
 *   'cu-abc123',
 *   { score: 95, issues: [], recommendation: 'approve' }
 * );
 * if (result.success) {
 *   console.log('Task fully completed');
 * }
 * ```
 */
export async function completeGatekeeperTask(
  dbTaskId: string,
  clickUpTaskId: string,
  report: QAReport
): Promise<GatekeeperCompletionResult> {
  const result: GatekeeperCompletionResult = {
    success: false,
    commentPosted: false,
    statusUpdated: false,
    localTaskUpdated: false,
  };

  logger.info(`Completing Gatekeeper task: db=${dbTaskId}, clickup=${clickUpTaskId}, recommendation=${report.recommendation}`);

  try {
    // Step 1: Post QA report as comment
    const commentResult = await postQAReport(clickUpTaskId, report);
    result.commentPosted = commentResult.success;

    if (!commentResult.success) {
      logger.error(`Failed to post QA report comment: ${commentResult.error}`);
    }

    // Step 2: Update ClickUp task status based on recommendation
    const newStatus = QA_STATUS_MAP[report.recommendation];
    const statusResult = await updateTaskStatus(clickUpTaskId, newStatus);
    result.statusUpdated = statusResult.success;

    if (!statusResult.success) {
      logger.error(`Failed to update task status: ${statusResult.error}`);
    }

    // Step 3: Mark local task as completed
    const output = JSON.stringify({
      clickUpTaskId,
      report,
      commentPosted: result.commentPosted,
      statusUpdated: result.statusUpdated,
    });

    if (result.commentPosted || result.statusUpdated) {
      // Partial success - at least something worked
      markCompleted(dbTaskId, output);
      result.localTaskUpdated = true;
    } else {
      // Complete failure - mark as failed
      markFailed(
        dbTaskId,
        `ClickUp operations failed: comment=${commentResult.error}, status=${statusResult.error}`
      );
      result.localTaskUpdated = true;
      result.error = 'All ClickUp operations failed';
    }

    // Step 4: Log audit entry
    logAuditEvent({
      agentId: 'gatekeeper',
      actionType: 'gatekeeper_complete',
      actionDetail: `QA ${report.recommendation}: score=${report.score}, issues=${report.issues.length}`,
      riskLevel: 'low',
      taskId: dbTaskId,
    });

    // Overall success if comment or status update worked
    result.success = result.commentPosted || result.statusUpdated;

    logger.info(`Gatekeeper task ${result.success ? 'completed' : 'failed'}: comment=${result.commentPosted}, status=${result.statusUpdated}`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Gatekeeper workflow error: ${errorMessage}`);

    // Mark local task as failed
    try {
      markFailed(dbTaskId, `Workflow error: ${errorMessage}`);
      result.localTaskUpdated = true;
    } catch {
      logger.error('Failed to mark local task as failed');
    }

    result.error = errorMessage;
    return result;
  }
}
