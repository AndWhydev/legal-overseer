/**
 * Briefing module — Legal Overseer.
 *
 * Single import point for daily briefing functionality:
 *   - types.ts:      type shapes for the briefing payload
 *   - aggregator.ts: build the snapshot from the database
 *   - scheduler.ts:  cron-driven email delivery
 *   - alerts.ts:     proactive alert checks (governance-derived)
 */

export type {
  DailyBriefing,
  BriefingConfig,
  SystemHealth,
  CircuitBreakerSummary,
  MatterStats,
  ReviewQueueStats,
  DeadlineCalendarStats,
  BillingStats,
  BriefingAlert,
  AlertSeverity,
} from './types.js';

export { DEFAULT_BRIEFING_CONFIG } from './types.js';

export { aggregateDailyBriefing } from './aggregator.js';

export {
  initBriefingScheduler,
  stopBriefingScheduler,
  sendScheduledBriefing,
  runBriefingNow,
  formatBriefingMessage,
  DEFAULT_BRIEFING_CRON,
} from './scheduler.js';

export {
  checkAlertConditions,
  dispatchAlerts,
  runAlertCheck,
  clearAlertCooldowns,
  DEFAULT_ALERT_THRESHOLDS,
  type AlertTrigger,
  type AlertThresholds,
} from './alerts.js';
