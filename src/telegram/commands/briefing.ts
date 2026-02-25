/**
 * /briefing command handler
 *
 * Generates and sends a formatted daily briefing to the user on demand.
 * Provides "Chess Master" visibility into all BitBit operations.
 */

import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { aggregateDailyBriefing, type DailyBriefing, type BriefingAlert } from '../../briefing/index.js';

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
      return '✅';
    case 'degraded':
      return '⚠️';
    case 'critical':
      return '❌';
  }
}

/**
 * Get alert emoji based on severity
 */
function getAlertEmoji(severity: BriefingAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
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
function formatBriefingMessage(briefing: DailyBriefing): string {
  const { systemHealth, taskSummary, rdScout, gatekeeper, opsOfficer, alerts, generatedAt } = briefing;

  // Count open circuit breakers
  const openBreakers = systemHealth.circuitBreakers.filter(cb => cb.state === 'open').length;
  const totalBreakers = systemHealth.circuitBreakers.length;

  // Build message sections
  const lines: string[] = [];

  // Header
  lines.push('<b>📊 Daily Briefing</b>');
  lines.push('');

  // System Status
  const statusEmoji = getStatusEmoji(systemHealth.status);
  lines.push(`<b>System Status:</b> ${statusEmoji} ${escapeHtml(systemHealth.status)}`);
  lines.push(`• Uptime: ${escapeHtml(formatUptime(systemHealth.uptimeMs))}`);
  lines.push(`• Circuit Breakers: ${openBreakers}/${totalBreakers} open`);
  if (systemHealth.killSwitchActive) {
    lines.push('• ⚠️ <b>Kill Switch Active</b>');
  }
  if (systemHealth.disabledAgents.length > 0) {
    lines.push(`• Disabled Agents: ${escapeHtml(systemHealth.disabledAgents.join(', '))}`);
  }
  lines.push('');

  // Tasks
  lines.push(`<b>Tasks (${briefing.timeWindowHours}h):</b>`);
  lines.push(`• Pending: ${taskSummary.pending} | Completed: ${taskSummary.completed} | Failed: ${taskSummary.failed}`);
  lines.push(`• Awaiting Approval: ${taskSummary.awaitingApproval}`);
  lines.push('');

  // R&D Scout
  lines.push('<b>🔍 R&D Scout:</b>');
  lines.push(`• Last Run: ${escapeHtml(formatDate(rdScout.lastRunAt))}`);
  lines.push(`• Opportunities: ${rdScout.opportunitiesFound} | Trending: ${rdScout.trendingKeywords.length}`);
  lines.push(`• Next Run: ${escapeHtml(formatDate(rdScout.nextRunAt))}`);
  lines.push('');

  // Gatekeeper
  lines.push('<b>✅ Gatekeeper:</b>');
  lines.push(`• Reviews: ${gatekeeper.reviewsProcessed} (Approved: ${gatekeeper.approved}, Flagged: ${gatekeeper.flagged}, Returned: ${gatekeeper.returned})`);
  lines.push('');

  // Ops Officer
  lines.push('<b>💰 Ops Officer:</b>');
  lines.push(`• Invoices: ${opsOfficer.invoicesProcessed} | Total: ${escapeHtml(formatCurrency(opsOfficer.totalAmount, opsOfficer.currency))}`);
  lines.push(`• Pending Approvals: ${opsOfficer.pendingApprovals}`);

  // Alerts (if any)
  if (alerts.length > 0) {
    lines.push('');
    lines.push('<b>⚠️ Alerts:</b>');
    for (const alert of alerts) {
      const emoji = getAlertEmoji(alert.severity);
      lines.push(`• ${emoji} ${escapeHtml(alert.message)}`);
    }
  }

  // Footer
  lines.push('');
  lines.push(`<i>Generated ${escapeHtml(formatDate(generatedAt))}</i>`);

  return lines.join('\n');
}

/**
 * Register /briefing command on bot
 */
export function registerBriefingCommand(bot: Bot): void {
  bot.command('briefing', async (ctx: Context) => {
    try {
      // Generate the daily briefing
      const briefing = await aggregateDailyBriefing();

      // Format and send
      const message = formatBriefingMessage(briefing);
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(
        `<b>❌ Briefing Error</b>\n\nFailed to generate briefing: ${escapeHtml(errorMessage)}`,
        { parse_mode: 'HTML' }
      );
    }
  });
}
