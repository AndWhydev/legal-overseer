/**
 * Telegram module barrel export
 */

export { bot, initBot, isBotReady } from './bot.js';
export { handleTelegramWebhook, logTelegramStatus } from './webhook.js';
export { createApprovalKeyboard, createConfirmKeyboard } from './keyboards.js';
export {
  sendApprovalRequest,
  sendNotification,
  sendStatusReport,
  sendTaskNotification,
  sendSystemAlert,
  escapeHtml,
  type SendApprovalParams,
  type SendApprovalResult,
  type StatusReport,
  type NotificationResult,
  type TaskEvent,
  type TaskNotificationData,
  type AlertSeverity,
  type SystemAlertData,
} from './notifications.js';
