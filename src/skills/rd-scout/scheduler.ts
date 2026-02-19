/**
 * R&D Scout Scheduler Module
 *
 * Handles cron-based scheduling for automated weekly research reports.
 * Uses node-cron to schedule research pipeline execution.
 *
 * Default schedule: Monday 04:00 AEST (Sunday 18:00 UTC)
 * Can be overridden via RD_SCOUT_CRON environment variable for testing.
 *
 * @module skills/rd-scout/scheduler
 */

import cron from 'node-cron';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('RDScout');

/**
 * Default cron expression for weekly reports.
 *
 * Sunday 18:00 UTC = Monday 04:00 AEST (UTC+10)
 * Format: minute hour day-of-month month day-of-week
 */
export const WEEKLY_REPORT_CRON = '0 18 * * 0';

/**
 * Type for the scheduled job reference
 */
export type ScheduledTask = ReturnType<typeof cron.schedule>;

/**
 * Schedule the weekly research report execution
 *
 * Uses node-cron to schedule a callback function to run on the configured schedule.
 * The schedule can be overridden via the RD_SCOUT_CRON environment variable.
 *
 * @param callback - Async function to execute on schedule
 * @returns The scheduled cron task (can be used to stop scheduling)
 *
 * @example
 * ```typescript
 * const task = scheduleWeeklyReport(async () => {
 *   const report = await runResearchPipeline(config);
 *   console.log('Report generated:', report.reportId);
 * });
 *
 * // To stop the schedule:
 * task.stop();
 * ```
 */
export function scheduleWeeklyReport(
  callback: () => Promise<void>
): ScheduledTask {
  // Allow environment override for testing
  const cronExpression = process.env.RD_SCOUT_CRON || WEEKLY_REPORT_CRON;

  // Validate the cron expression
  if (!cron.validate(cronExpression)) {
    logger.error(
      `Invalid cron expression "${cronExpression}". Using default: ${WEEKLY_REPORT_CRON}`
    );
  }

  const validCron = cron.validate(cronExpression)
    ? cronExpression
    : WEEKLY_REPORT_CRON;

  // Schedule the task
  const task = cron.schedule(
    validCron,
    async () => {
      logger.info('Starting weekly research report...');

      try {
        await callback();
        logger.info('Weekly research report completed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Weekly research report failed: ${errorMessage}`);

        // Log stack trace for debugging if available
        if (error instanceof Error && error.stack) {
          logger.error('Stack trace:', error.stack);
        }
      }
    },
    {
      timezone: 'UTC', // Explicit UTC to avoid server timezone issues
    }
  );

  logger.info(`Scheduled weekly report with cron "${validCron}" (UTC)`);
  logger.info('Next execution: Monday 04:00 AEST (Sunday 18:00 UTC)');

  return task;
}

/**
 * Run the research report immediately (for testing/manual triggers)
 *
 * @param callback - Async function to execute
 *
 * @example
 * ```typescript
 * await runReportNow(async () => {
 *   return runResearchPipeline(config);
 * });
 * ```
 */
export async function runReportNow(callback: () => Promise<void>): Promise<void> {
  logger.info('Running research report immediately (manual trigger)...');

  try {
    await callback();
    logger.info('Manual research report completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Manual research report failed: ${errorMessage}`);
    throw error; // Re-throw for manual runs so caller knows it failed
  }
}

/**
 * Get human-readable description of the cron schedule
 *
 * @param cronExpression - The cron expression to describe
 * @returns Human-readable schedule description
 */
export function describeCronSchedule(
  cronExpression: string = WEEKLY_REPORT_CRON
): string {
  if (cronExpression === WEEKLY_REPORT_CRON) {
    return 'Every Monday at 04:00 AEST (Sunday 18:00 UTC)';
  }

  // For custom schedules, provide a basic description
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) {
    return `Custom schedule: ${cronExpression}`;
  }

  const [minute, hour, , , dayOfWeek] = parts;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayOfWeek === '*' ? 'every day' : days[parseInt(dayOfWeek, 10)] || 'custom day';

  return `${dayName} at ${hour}:${minute.padStart(2, '0')} UTC`;
}
