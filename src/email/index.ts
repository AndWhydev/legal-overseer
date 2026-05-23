/**
 * Email module — single channel for all operator notifications.
 *
 * See notifier.ts for the implementation. Configuration lives in env:
 *   ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 *   optional SMTP_FROM, SMTP_SECURE.
 */

export {
  escapeHtml,
  isEmailConfigured,
  sendEscalation,
  sendSystemAlert,
  sendApprovalRequest,
  sendNotification,
  sendBriefingEmail,
  type AlertSeverity,
  type SystemAlertData,
  type SendApprovalParams,
  type SendApprovalResult,
  type NotificationResult,
} from './notifier.js';
