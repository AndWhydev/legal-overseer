/**
 * Briefing Scheduler Module
 *
 * Handles cron-based scheduling for automated daily briefing delivery.
 * Uses node-cron to schedule briefing generation and email delivery.
 *
 * Default schedule: 8:00 AM daily (local server time)
 * Can be overridden via BRIEFING_CRON environment variable.
 *
 * @module briefing/scheduler
 */

import cron from 'node-cron';
import { aggregateDailyBriefing, type DailyBriefing, type BriefingAlert } from './index.js';
import { sendBriefingEmail, isEmailConfigured } from '../email/notifier.js';
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
 * Escape HTML special characters for safe inclusion in email bodies.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
 * Format the daily briefing as an HTML email body.
 */
export function formatBriefingMessage(briefing: DailyBriefing): string {
  const { systemHealth, taskSummary, rdScout, gatekeeper, opsOfficer, alerts, generatedAt } = briefing;

  // Count open circuit breakers
  const openBreakers = systemHealth.circuitBreakers.filter(cb => cb.state === 'open').length;
  const totalBreakers = systemHealth.circuitBreakers.length;

  const sections: string[] = [];

  // Header
  sections.push('<h1>\uD83D\uDCCA Daily Briefing</h1>');

  // System Status
  const statusEmoji = getStatusEmoji(systemHealth.status);
  const sysItems: string[] = [
    `<li>Uptime: ${escapeHtml(formatUptime(systemHealth.uptimeMs))}</li>`,
    `<li>Circuit Breakers: ${openBreakers}/${totalBreakers} open</li>`,
  ];
  if (systemHealth.killSwitchActive) {
    sysItems.push('<li><b>\u26A0\uFE0F Kill Switch Active</b></li>');
  }
  if (systemHealth.disabledAgents.length > 0) {
    sysItems.push(`<li>Disabled Agents: ${escapeHtml(systemHealth.disabledAgents.join(', '))}</li>`);
  }
  sections.push(
    `<h2>System Status: ${statusEmoji} ${escapeHtml(systemHealth.status)}</h2><ul>${sysItems.join('')}</ul>`,
  );

  // Tasks
  sections.push(`<h2>Tasks (${briefing.timeWindowHours}h)</h2><ul>` +
    `<li>Pending: ${taskSummary.pending} | Completed: ${taskSummary.completed} | Failed: ${taskSummary.failed}</li>` +
    `<li>Awaiting Approval: ${taskSummary.awaitingApproval}</li>` +
    `</ul>`);

  // R&D Scout
  sections.push(`<h2>\uD83D\uDD0D R&amp;D Scout</h2><ul>` +
    `<li>Last Run: ${escapeHtml(formatDate(rdScout.lastRunAt))}</li>` +
    `<li>Opportunities: ${rdScout.opportunitiesFound} | Trending: ${rdScout.trendingKeywords.length}</li>` +
    `<li>Next Run: ${escapeHtml(formatDate(rdScout.nextRunAt))}</li>` +
    `</ul>`);

  // Gatekeeper
  sections.push(`<h2>\u2705 Gatekeeper</h2><ul>` +
    `<li>Reviews: ${gatekeeper.reviewsProcessed} (Approved: ${gatekeeper.approved}, Flagged: ${gatekeeper.flagged}, Returned: ${gatekeeper.returned})</li>` +
    `</ul>`);

  // Ops Officer
  sections.push(`<h2>\uD83D\uDCB0 Ops Officer</h2><ul>` +
    `<li>Invoices: ${opsOfficer.invoicesProcessed} | Total: ${escapeHtml(formatCurrency(opsOfficer.totalAmount, opsOfficer.currency))}</li>` +
    `<li>Pending Approvals: ${opsOfficer.pendingApprovals}</li>` +
    `</ul>`);

  // Alerts (if any)
  if (alerts.length > 0) {
    const alertItems = alerts
      .map(a => `<li>${getAlertEmoji(a.severity)} ${escapeHtml(a.message)}</li>`)
      .join('');
    sections.push(`<h2>\u26A0\uFE0F Alerts</h2><ul>${alertItems}</ul>`);
  }

  // Footer
  sections.push(`<p style="color:#888"><i>Generated ${escapeHtml(formatDate(generatedAt))}</i></p>`);

  return sections.join('\n');
}

/**
 * Send the scheduled briefing as an email to ADMIN_EMAIL.
 */
export async function sendScheduledBriefing(): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn(
      'Briefing scheduler: SMTP not configured (need ADMIN_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS) — skipping send',
    );
    return;
  }

  try {
    logger.info('Briefing scheduler: Generating daily briefing...');

    // Generate the briefing
    const briefing = await aggregateDailyBriefing();

    // Format as HTML email body
    const html = formatBriefingMessage(briefing);
    const date = new Date(briefing.generatedAt).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const subject = `[BitBit] Daily briefing — ${date}`;

    // Send via email
    const result = await sendBriefingEmail(subject, html);

    if (result.success) {
      logger.info(
        `Briefing scheduler: Daily briefing sent successfully${result.messageId ? ` (message id: ${result.messageId})` : ''}`,
      );
    } else {
      logger.warn(`Briefing scheduler: Failed to send daily briefing: ${result.error ?? 'unknown error'}`);
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
 *
 * The briefing is sent via email to ADMIN_EMAIL using the SMTP_* settings.
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
