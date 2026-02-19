/**
 * Briefing Scheduler Module
 *
 * Handles cron-based scheduling for automated daily briefing delivery.
 * Uses node-cron to schedule briefing generation and Telegram delivery.
 *
 * Default schedule: 8:00 AM daily (local server time)
 * Can be overridden via BRIEFING_CRON environment variable.
 *
 * @module briefing/scheduler
 */

import cron from 'node-cron';
import { aggregateDailyBriefing, type DailyBriefing, type BriefingAlert } from './index.js';
import { sendNotification } from '../telegram/notifications.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('BriefingScheduler');

/**
 * Default cron expression for daily briefings.
 *
 * 8:00 AM daily (server timezone)
 * Format: minute hour day-of-month month day-of-week
 */
export const DEFAULT_BRIEFING_CRON = '0 8 * * *';

/**
 * Type for the scheduled job reference
 */
export type ScheduledTask = ReturnType<typeof cron.schedule>;

/**
 * Module-level reference to the scheduled task (for stopping if needed)
 */
let scheduledTask: ScheduledTask | null = null;

/**
 * Escape HTML special characters for Telegram HTML parse mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get status emoji based on system health
 */
function getStatusEmoji(status: 'healthy' | 'degraded' | 'critical'): string {
  switch (status) {
    case 'healthy':
      return '\u2705';
    case 'degraded':
      return '\u26A0\uFE0F';
    case 'critical':
      return '\u274C';
  }
}

/**
 * Get alert emoji based on severity
 */
function getAlertEmoji(severity: BriefingAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return '\uD83D\uDEA8';
    case 'error':
      return '\u274C';
    case 'warning':
      return '\u26A0\uFE0F';
    case 'info':
      return '\u2139\uFE0F';
  }
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date for display (AEST timezone)
 */
function formatDate(isoDate: string | null): string {
  if (!isoDate) {
    return 'N/A';
  }
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Format the daily briefing as a Telegram HTML message
 */
export function formatBriefingMessage(briefing: DailyBriefing): string {
  const { systemHealth, taskSummary, rdScout, gatekeeper, opsOfficer, alerts, generatedAt } = briefing;

  // Count open circuit breakers
  const openBreakers = systemHealth.circuitBreakers.filter(cb => cb.state === 'open').length;
  const totalBreakers = systemHealth.circuitBreakers.length;

  // Build message sections
  const lines: string[] = [];

  // Header
  lines.push('<b>\uD83D\uDCCA Daily Briefing</b>');
  lines.push('');

  // System Status
  const statusEmoji = getStatusEmoji(systemHealth.status);
  lines.push(`<b>System Status:</b> ${statusEmoji} ${escapeHtml(systemHealth.status)}`);
  lines.push(`\u2022 Uptime: ${escapeHtml(formatUptime(systemHealth.uptimeMs))}`);
  lines.push(`\u2022 Circuit Breakers: ${openBreakers}/${totalBreakers} open`);
  if (systemHealth.killSwitchActive) {
    lines.push('\u2022 \u26A0\uFE0F <b>Kill Switch Active</b>');
  }
  if (systemHealth.disabledAgents.length > 0) {
    lines.push(`\u2022 Disabled Agents: ${escapeHtml(systemHealth.disabledAgents.join(', '))}`);
  }
  lines.push('');

  // Tasks
  lines.push(`<b>Tasks (${briefing.timeWindowHours}h):</b>`);
  lines.push(`\u2022 Pending: ${taskSummary.pending} | Completed: ${taskSummary.completed} | Failed: ${taskSummary.failed}`);
  lines.push(`\u2022 Awaiting Approval: ${taskSummary.awaitingApproval}`);
  lines.push('');

  // R&D Scout
  lines.push('<b>\uD83D\uDD0D R&D Scout:</b>');
  lines.push(`\u2022 Last Run: ${escapeHtml(formatDate(rdScout.lastRunAt))}`);
  lines.push(`\u2022 Opportunities: ${rdScout.opportunitiesFound} | Trending: ${rdScout.trendingKeywords.length}`);
  lines.push(`\u2022 Next Run: ${escapeHtml(formatDate(rdScout.nextRunAt))}`);
  lines.push('');

  // Gatekeeper
  lines.push('<b>\u2705 Gatekeeper:</b>');
  lines.push(`\u2022 Reviews: ${gatekeeper.reviewsProcessed} (Approved: ${gatekeeper.approved}, Flagged: ${gatekeeper.flagged}, Returned: ${gatekeeper.returned})`);
  lines.push('');

  // Ops Officer
  lines.push('<b>\uD83D\uDCB0 Ops Officer:</b>');
  lines.push(`\u2022 Invoices: ${opsOfficer.invoicesProcessed} | Total: ${escapeHtml(formatCurrency(opsOfficer.totalAmount, opsOfficer.currency))}`);
  lines.push(`\u2022 Pending Approvals: ${opsOfficer.pendingApprovals}`);

  // Alerts (if any)
  if (alerts.length > 0) {
    lines.push('');
    lines.push('<b>\u26A0\uFE0F Alerts:</b>');
    for (const alert of alerts) {
      const emoji = getAlertEmoji(alert.severity);
      lines.push(`\u2022 ${emoji} ${escapeHtml(alert.message)}`);
    }
  }

  // Footer
  lines.push('');
  lines.push(`<i>Generated ${escapeHtml(formatDate(generatedAt))}</i>`);

  return lines.join('\n');
}

/**
 * Send the scheduled briefing to the configured chat
 */
export async function sendScheduledBriefing(): Promise<void> {
  // Get chat ID from environment
  const chatIdString = process.env.BRIEFING_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!chatIdString) {
    logger.warn('Briefing scheduler: No chat ID configured (BRIEFING_CHAT_ID or TELEGRAM_CHAT_ID)');
    return;
  }

  const chatId = parseInt(chatIdString, 10);
  if (isNaN(chatId)) {
    logger.error(`Briefing scheduler: Invalid chat ID "${chatIdString}"`);
    return;
  }

  try {
    logger.info('Briefing scheduler: Generating daily briefing...');

    // Generate the briefing
    const briefing = await aggregateDailyBriefing();

    // Format as Telegram message
    const message = formatBriefingMessage(briefing);

    // Send via Telegram
    const messageId = await sendNotification(chatId, message);

    if (messageId) {
      logger.info(`Briefing scheduler: Daily briefing sent successfully (message ID: ${messageId})`);
    } else {
      logger.warn('Briefing scheduler: Failed to send daily briefing');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Briefing scheduler: Error generating/sending briefing: ${errorMessage}`);

    if (error instanceof Error && error.stack) {
      logger.error(`Briefing scheduler: Stack trace: ${error.stack}`);
    }
  }
}

/**
 * Initialize the briefing scheduler
 *
 * Reads configuration from environment variables:
 * - BRIEFING_ENABLED: "true" to enable (default: disabled)
 * - BRIEFING_CRON: Cron expression (default: "0 8 * * *" = 8:00 AM daily)
 * - BRIEFING_CHAT_ID: Target chat ID (defaults to TELEGRAM_CHAT_ID)
 */
export function initBriefingScheduler(): void {
  // Check if briefing is enabled
  const enabled = process.env.BRIEFING_ENABLED === 'true';
  if (!enabled) {
    logger.info('Briefing scheduler: Disabled (set BRIEFING_ENABLED=true to enable)');
    return;
  }

  // Parse cron expression
  const cronExpression = process.env.BRIEFING_CRON || DEFAULT_BRIEFING_CRON;

  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    logger.error(`Briefing scheduler: Invalid cron expression "${cronExpression}". Using default: ${DEFAULT_BRIEFING_CRON}`);
  }

  const validCron = cron.validate(cronExpression) ? cronExpression : DEFAULT_BRIEFING_CRON;

  // Schedule the task
  scheduledTask = cron.schedule(
    validCron,
    async () => {
      logger.info('Briefing scheduler: Starting scheduled briefing...');
      await sendScheduledBriefing();
    },
    {
      timezone: 'Australia/Sydney', // AEST timezone for briefings
    }
  );

  logger.info(`Briefing scheduler: Initialized with cron "${validCron}" (AEST)`);

  // Log next run time hint
  if (validCron === DEFAULT_BRIEFING_CRON) {
    logger.info('Briefing scheduler: Next briefing at 8:00 AM AEST');
  }
}

/**
 * Stop the briefing scheduler
 */
export function stopBriefingScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Briefing scheduler: Stopped');
  }
}

/**
 * Run briefing immediately (for testing/manual triggers)
 */
export async function runBriefingNow(): Promise<void> {
  logger.info('Briefing scheduler: Running briefing immediately (manual trigger)...');
  await sendScheduledBriefing();
}
