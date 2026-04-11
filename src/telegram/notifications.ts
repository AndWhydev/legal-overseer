/**
 * Telegram notification helpers
 *
 * Functions for sending approval requests and other notifications.
 */

import { bot } from './bot.js';
import { createApprovalKeyboard } from './keyboards.js';
import { createApprovalRequest } from '../db/repositories/approvals.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('TelegramNotify');

/**
 * Escape HTML special characters for Telegram HTML parse mode
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format currency amount for display
 */
function formatAmount(amount: number, currency: string): string {
  // Handle common currencies
  const currencySymbols: Record<string, string> = {
    USD: '$',
    AUD: 'A$',
    EUR: '€',
    GBP: '£',
    CNY: '¥',
  };

  const symbol = currencySymbols[currency.toUpperCase()] ?? currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Parameters for sending an approval request
 */
export interface SendApprovalParams {
  chatId: number;
  taskId: string;
  actionType: string;
  actionSummary: string;
  amount?: number;
  currency?: string;
}

/**
 * Result of sending an approval request
 */
export interface SendApprovalResult {
  success: boolean;
  approvalId?: string;
  messageId?: number;
  error?: string;
}

/**
 * Send an approval request message with inline buttons
 *
 * Creates an approval record in the database and sends a formatted
 * message to the specified chat with Approve/Reject buttons.
 *
 * @param params - Approval request parameters
 * @returns Result with approval ID and message ID if successful
 */
export async function sendApprovalRequest(
  params: SendApprovalParams
): Promise<SendApprovalResult> {
  if (!bot) {
    return { success: false, error: 'Bot not configured' };
  }

  try {
    // Create approval record in database
    const approval = createApprovalRequest({
      taskId: params.taskId,
      actionType: params.actionType,
      actionSummary: params.actionSummary,
      amount: params.amount,
      currency: params.currency,
    });

    // Build message
    let message = `<b>🔔 Approval Required</b>\n\n`;
    message += `<b>Task:</b> <code>${escapeHtml(params.taskId)}</code>\n`;
    message += `<b>Action:</b> ${escapeHtml(params.actionType)}\n\n`;
    message += `${escapeHtml(params.actionSummary)}\n`;

    // Add amount if present
    if (params.amount !== undefined && params.currency) {
      message += `\n💰 <b>Amount:</b> ${formatAmount(params.amount, params.currency)}\n`;
    }

    // Add expiry warning
    message += `\n<i>⏰ This request expires in 24 hours.</i>`;

    // Create inline keyboard
    const keyboard = createApprovalKeyboard(approval.token);

    // Send message
    const sentMessage = await bot.api.sendMessage(params.chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info(`Approval request ${approval.id} sent to chat ${params.chatId}`);

    return {
      success: true,
      approvalId: approval.id,
      messageId: sentMessage.message_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send approval request: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a simple notification message
 *
 * @param chatId - Telegram chat ID
 * @param message - Message text (HTML)
 * @returns Message ID if successful, undefined if failed
 */
export async function sendNotification(
  chatId: number,
  message: string
): Promise<number | undefined> {
  if (!bot) {
    logger.warn('Cannot send notification: bot not configured');
    return undefined;
  }

  try {
    const sent = await bot.api.sendMessage(chatId, message, {
      parse_mode: 'HTML',
    });
    return sent.message_id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send notification: ${errorMessage}`);
    return undefined;
  }
}

// ============================================
// Status Report
// ============================================

/**
 * Status report data structure
 */
export interface StatusReport {
  healthy: boolean;
  tasksPending: number;
  tasksCompleted: number;
  tasksFailed: number;
  approvalsPending: number;
  notableEvents?: string[];
}

/**
 * Result of sending a notification
 */
export interface NotificationResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Send a status report notification
 *
 * @param chatId - Telegram chat ID
 * @param report - Status report data
 * @returns Result with message ID if successful
 */
export async function sendStatusReport(
  chatId: number,
  report: StatusReport
): Promise<NotificationResult> {
  if (!bot) {
    return { success: false, error: 'Bot not configured' };
  }

  try {
    const systemStatus = report.healthy ? '✅ Healthy' : '⚠️ Degraded';
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

    let message = `<b>📊 BitBit Status Report</b>\n\n`;
    message += `<b>System:</b> ${systemStatus}\n\n`;
    message += `<b>Tasks (24h):</b>\n`;
    message += `• Pending: ${report.tasksPending}\n`;
    message += `• Completed: ${report.tasksCompleted}\n`;
    message += `• Failed: ${report.tasksFailed}\n\n`;
    message += `<b>Approvals:</b>\n`;
    message += `• Awaiting: ${report.approvalsPending}\n`;

    if (report.notableEvents && report.notableEvents.length > 0) {
      message += `\n<b>Notable:</b>\n`;
      for (const event of report.notableEvents) {
        message += `• ${escapeHtml(event)}\n`;
      }
    }

    message += `\n<i>Generated ${timestamp}</i>`;

    const sent = await bot.api.sendMessage(chatId, message, {
      parse_mode: 'HTML',
    });

    return { success: true, messageId: sent.message_id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send status report: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ============================================
// Task Notification
// ============================================

/**
 * Task event type
 */
export type TaskEvent = 'completed' | 'failed' | 'requires_approval';

/**
 * Task notification data
 */
export interface TaskNotificationData {
  taskId: string;
  skill: string;
  event: TaskEvent;
  result?: string;
  error?: string;
  durationMs?: number;
}

/**
 * Send a task notification
 *
 * @param chatId - Telegram chat ID
 * @param data - Task notification data
 * @returns Result with message ID if successful
 */
export async function sendTaskNotification(
  chatId: number,
  data: TaskNotificationData
): Promise<NotificationResult> {
  if (!bot) {
    return { success: false, error: 'Bot not configured' };
  }

  try {
    let emoji: string;
    let title: string;
    let details: string;

    switch (data.event) {
      case 'completed':
        emoji = '✅';
        title = 'Task Completed';
        details = data.result ? escapeHtml(data.result) : 'Task completed successfully';
        break;
      case 'failed':
        emoji = '❌';
        title = 'Task Failed';
        details = data.error ? escapeHtml(data.error) : 'Task failed (no error details)';
        break;
      case 'requires_approval':
        emoji = '⏳';
        title = 'Approval Required';
        details = 'Task requires human approval to proceed';
        break;
    }

    let message = `<b>${emoji} ${title}</b>\n\n`;
    message += `<b>Task:</b> <code>${escapeHtml(data.taskId)}</code>\n`;
    message += `<b>Skill:</b> ${escapeHtml(data.skill)}\n\n`;
    message += `${details}`;

    if (data.durationMs !== undefined) {
      const durationSec = Math.round(data.durationMs / 1000);
      message += `\n\n<i>Duration: ${durationSec}s</i>`;
    }

    const sent = await bot.api.sendMessage(chatId, message, {
      parse_mode: 'HTML',
    });

    return { success: true, messageId: sent.message_id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send task notification: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ============================================
// System Alert
// ============================================

/**
 * Alert severity level
 */
export type AlertSeverity = 'warning' | 'critical' | 'error';

/**
 * System alert data
 */
export interface SystemAlertData {
  severity: AlertSeverity;
  title: string;
  message: string;
  component?: string;
  action?: string;
}

/**
 * Send a system alert notification
 *
 * @param chatId - Telegram chat ID
 * @param alert - Alert data
 * @returns Result with message ID if successful
 */
export async function sendSystemAlert(
  chatId: number,
  alert: SystemAlertData
): Promise<NotificationResult> {
  if (!bot) {
    return { success: false, error: 'Bot not configured' };
  }

  try {
    let emoji: string;
    switch (alert.severity) {
      case 'critical':
        emoji = '🚨';
        break;
      case 'error':
        emoji = '❗';
        break;
      case 'warning':
        emoji = '⚠️';
        break;
    }

    let message = `<b>${emoji} ${escapeHtml(alert.title)}</b>\n\n`;
    message += `${escapeHtml(alert.message)}`;

    if (alert.component) {
      message += `\n\n<b>Component:</b> ${escapeHtml(alert.component)}`;
    }

    if (alert.action) {
      message += `\n\n<b>Action:</b> ${escapeHtml(alert.action)}`;
    }

    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    message += `\n\n<i>${timestamp}</i>`;

    const sent = await bot.api.sendMessage(chatId, message, {
      parse_mode: 'HTML',
    });

    logger.info(`System alert sent: ${alert.severity} - ${alert.title}`);

    return { success: true, messageId: sent.message_id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send system alert: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
