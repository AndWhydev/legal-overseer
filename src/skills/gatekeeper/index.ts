/**
 * Gatekeeper Skill Module
 *
 * Multi-modal content QA for CheekyGlo brand compliance.
 * Analyzes video frames, audio levels, and visual elements
 * against style guide rules.
 *
 * Architecture:
 * - media/    - FFmpeg-based media processing (probe, frames, audio)
 * - analysis/ - Content analysis (technical, visual, scoring)
 * - pipeline.ts - Complete QA pipeline orchestration
 *
 * Usage:
 * ```typescript
 * import { processGatekeeperTask, runQAPipeline } from './skills/gatekeeper';
 *
 * // Run pipeline only (no ClickUp integration)
 * const result = await runQAPipeline('/path/to/video.mp4');
 *
 * // Complete task workflow (pipeline + ClickUp)
 * const outcome = await processGatekeeperTask(
 *   'db-task-id',
 *   'clickup-task-id',
 *   '/path/to/video.mp4'
 * );
 * ```
 */

import { runQAPipeline, type PipelineOptions } from './pipeline.js';
import { completeGatekeeperTask } from '../../integrations/clickup/workflow.js';
import type { QAReport } from '../../integrations/clickup/types.js';
import type { QAResult, QARecommendation } from './types.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Gatekeeper');

/**
 * Result of processing a Gatekeeper task
 */
export interface ProcessGatekeeperResult {
  /** Whether the task was processed successfully */
  success: boolean;
  /** The QA report that was posted to ClickUp */
  report: QAReport | null;
  /** The full QA result from pipeline */
  qaResult: QAResult | null;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Map internal QARecommendation to ClickUp QAReport recommendation
 */
function mapRecommendation(
  recommendation: QARecommendation
): QAReport['recommendation'] {
  switch (recommendation) {
    case 'approve':
      return 'approve';
    case 'flag_for_review':
      return 'review';
    case 'return_to_creator':
      return 'reject';
    default:
      return 'reject';
  }
}

/**
 * Convert QAResult to QAReport format for ClickUp
 */
function buildQAReport(result: QAResult): QAReport {
  return {
    score: result.overallScore,
    issues: result.issues,
    recommendation: mapRecommendation(result.recommendation),
    feedback: result.issues.length > 0
      ? `Found ${result.issues.length} issue(s) during QA analysis.`
      : 'Content passed QA validation.',
  };
}

/**
 * Process a Gatekeeper task: run QA pipeline and post results to ClickUp.
 *
 * Complete workflow:
 * 1. Run the full QA pipeline on the media file
 * 2. Convert QAResult to ClickUp QAReport format
 * 3. Post report to ClickUp and update task status
 * 4. Return comprehensive result
 *
 * @param dbTaskId - Local database task ID for tracking
 * @param clickUpTaskId - ClickUp task ID to update
 * @param mediaPath - Absolute path to the media file to analyze
 * @param options - Optional pipeline configuration
 * @returns Promise resolving to processing result
 *
 * @example
 * ```typescript
 * const result = await processGatekeeperTask(
 *   'task-abc123',
 *   'cu-xyz789',
 *   '/tmp/uploads/video.mp4',
 *   { verbose: true }
 * );
 *
 * if (result.success) {
 *   console.log(`QA Score: ${result.report?.score}`);
 *   console.log(`Recommendation: ${result.report?.recommendation}`);
 * } else {
 *   console.error(`Processing failed: ${result.error}`);
 * }
 * ```
 */
export async function processGatekeeperTask(
  dbTaskId: string,
  clickUpTaskId: string,
  mediaPath: string,
  options?: PipelineOptions
): Promise<ProcessGatekeeperResult> {
  logger.info(`Processing task: db=${dbTaskId}, clickup=${clickUpTaskId}`);

  try {
    // Step 1: Run QA pipeline
    logger.info(`Running QA pipeline on: ${mediaPath}`);
    const qaResult = await runQAPipeline(mediaPath, {
      ...options,
      verbose: options?.verbose ?? true,
    });

    logger.info(`Pipeline complete: score=${qaResult.overallScore}, recommendation=${qaResult.recommendation}`);

    // Step 2: Convert to ClickUp format
    const report = buildQAReport(qaResult);

    // Step 3: Post to ClickUp
    logger.info('Posting to ClickUp...');
    const clickUpResult = await completeGatekeeperTask(dbTaskId, clickUpTaskId, report);

    if (!clickUpResult.success) {
      logger.error(`ClickUp update failed: ${clickUpResult.error}`);
      return {
        success: false,
        report,
        qaResult,
        error: clickUpResult.error,
      };
    }

    logger.info('Task completed successfully');

    return {
      success: true,
      report,
      qaResult,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Error: ${error}`);

    return {
      success: false,
      report: null,
      qaResult: null,
      error,
    };
  }
}

// Re-export all types
export * from './types.js';

// Re-export media processing
export * from './media/index.js';

// Re-export content analysis (includes scoring)
export * from './analysis/index.js';

// Re-export pipeline
export { runQAPipeline, type PipelineOptions } from './pipeline.js';

// Re-export task context
export {
  parseTaskPayload,
  fetchGatekeeperTaskContext,
  getGatekeeperPrompt,
  type ClickUpTaskPayload,
  type GatekeeperTaskContext,
} from './task-context.js';
