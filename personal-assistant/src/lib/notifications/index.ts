export { dispatchNotification } from './dispatcher'
export type {
  NotificationType,
  NotificationUrgency,
  DispatchNotificationParams,
  DispatchResult,
} from './dispatcher'

export { getNotificationPreferences, updateNotificationPreferences } from './preferences'
export type { NotificationPreferences } from './preferences'

export {
  sendApprovalNeededEmail,
  sendDailyDigestEmail,
  sendWeeklyReportEmail,
  sendAlertEscalationEmail,
} from './email-templates'
export type {
  ApprovalEmailDetails,
  DigestData,
  WeeklyReportData,
  AlertEscalationDetails,
} from './email-templates'
