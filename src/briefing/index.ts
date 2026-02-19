/**
 * Briefing module index
 *
 * Single import point for daily briefing functionality:
 * - Types for briefing structure
 * - Aggregation for unified operational snapshot
 * - Scheduler for automated briefing delivery
 * - Alerts for proactive notifications
 *
 * Usage:
 * import { aggregateDailyBriefing, initBriefingScheduler, checkAlertConditions } from './briefing/index.js';
 */

// Types
export type {
  DailyBriefing,
  BriefingConfig,
  SystemHealth,
  TaskSummary,
  RdScoutSummary,
  GatekeeperSummary,
  OpsOfficerSummary,
  BriefingAlert,
  AlertSeverity,
  CircuitBreakerSummary,
  SkillTaskCounts,
} from './types.js';

export { DEFAULT_BRIEFING_CONFIG } from './types.js';

// Aggregation
export { aggregateDailyBriefing } from './aggregator.js';

// Scheduler
export {
  initBriefingScheduler,
  stopBriefingScheduler,
  sendScheduledBriefing,
  runBriefingNow,
  formatBriefingMessage,
  DEFAULT_BRIEFING_CRON,
} from './scheduler.js';

// Alerts
export {
  checkAlertConditions,
  dispatchAlerts,
  runAlertCheck,
  clearAlertCooldowns,
  DEFAULT_ALERT_THRESHOLDS,
  type AlertTrigger,
  type AlertThresholds,
} from './alerts.js';
