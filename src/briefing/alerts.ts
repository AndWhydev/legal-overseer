/**
 * Alert Dispatcher Module
 *
 * Handles proactive alert detection and dispatch for critical system events.
 * Monitors circuit breakers, task failure rates, approval backlogs, and kill switch status.
 *
 * Features:
 * - Event-driven alert detection
 * - Cooldown tracking to prevent alert spam
 * - Severity-based alert routing
 *
 * @module briefing/alerts
 */

import {
  isGlobalKillActive,
  hasOpenCircuit,
  getOpenCircuits,
  createSafeLogger,
} from '../governance/index.js';

const logger = createSafeLogger('BriefingAlerts');
import { getTaskStats24h } from '../db/repositories/tasks.js';
import { sendSystemAlert, type AlertSeverity } from '../email/notifier.js';

/**
 * Alert trigger types
 */
export type AlertTrigger =
  | 'circuit_breaker_open'
  | 'high_failure_rate'
  | 'approval_backlog'
  | 'kill_switch_active';

/**
 * Alert threshold configuration
 */
export interface AlertThresholds {
  /** Task failure rate percentage threshold (default: 20%) */
  failureRatePercent: number;
  /** Number of pending approvals to trigger backlog alert (default: 5) */
  approvalBacklogCount: number;
}

/**
 * Default alert thresholds
 */
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  failureRatePercent: 20,
  approvalBacklogCount: 5,
};

/**
 * Alert cooldown period in milliseconds (5 minutes)
 */
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Module-level Map to track last alert time per trigger type
 * Used to prevent alert spam
 */
const lastAlertTimes = new Map<AlertTrigger, Date>();

/**
 * Map alert triggers to severity levels
 */
const TRIGGER_SEVERITY: Record<AlertTrigger, AlertSeverity> = {
  kill_switch_active: 'critical',
  circuit_breaker_open: 'warning',
  high_failure_rate: 'error',
  approval_backlog: 'warning',
};

/**
 * Map alert triggers to human-readable titles
 */
const TRIGGER_TITLES: Record<AlertTrigger, string> = {
  kill_switch_active: 'Kill Switch Activated',
  circuit_breaker_open: 'Circuit Breaker Open',
  high_failure_rate: 'High Task Failure Rate',
  approval_backlog: 'Approval Backlog',
};

/**
 * Check if an alert is within cooldown period
 *
 * @param trigger - The alert trigger type
 * @returns true if within cooldown (should skip alert), false if can alert
 */
function isWithinCooldown(trigger: AlertTrigger): boolean {
  const lastAlert = lastAlertTimes.get(trigger);
  if (!lastAlert) {
    return false;
  }

  const now = new Date();
  const timeSinceLastAlert = now.getTime() - lastAlert.getTime();
  return timeSinceLastAlert < ALERT_COOLDOWN_MS;
}

/**
 * Record that an alert was sent for cooldown tracking
 *
 * @param trigger - The alert trigger type
 */
function recordAlertSent(trigger: AlertTrigger): void {
  lastAlertTimes.set(trigger, new Date());
}

/**
 * Check current system state for alert conditions
 *
 * Monitors:
 * - Global kill switch status
 * - Circuit breaker states
 * - Task failure rate (last hour)
 * - Approval backlog count
 *
 * @param thresholds - Optional custom thresholds (defaults to DEFAULT_ALERT_THRESHOLDS)
 * @returns Array of triggered alert conditions
 */
export async function checkAlertConditions(
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Promise<AlertTrigger[]> {
  const triggers: AlertTrigger[] = [];

  // Check kill switch
  if (isGlobalKillActive()) {
    triggers.push('kill_switch_active');
  }

  // Check circuit breakers
  if (hasOpenCircuit()) {
    triggers.push('circuit_breaker_open');
  }

  // Check task failure rate (last hour)
  const stats = getTaskStats24h(1); // 1 hour window
  const totalTasks = stats.byStatus.completed + stats.byStatus.failed;
  if (totalTasks > 0) {
    const failureRate = (stats.byStatus.failed / totalTasks) * 100;
    if (failureRate > thresholds.failureRatePercent) {
      triggers.push('high_failure_rate');
    }
  }

  // Check approval backlog
  if (stats.byStatus.awaitingApproval > thresholds.approvalBacklogCount) {
    triggers.push('approval_backlog');
  }

  return triggers;
}

/**
 * Get detailed message for an alert trigger
 *
 * @param trigger - The alert trigger type
 * @param thresholds - Current threshold values
 * @returns Detailed alert message
 */
function getAlertMessage(trigger: AlertTrigger, thresholds: AlertThresholds): string {
  switch (trigger) {
    case 'kill_switch_active':
      return 'The global kill switch has been activated. All agent operations are halted. Manual intervention required to resume operations.';

    case 'circuit_breaker_open': {
      const openCircuits = getOpenCircuits();
      const circuitList = openCircuits.length > 0 ? openCircuits.join(', ') : 'unknown';
      return `Circuit breaker(s) have opened due to repeated failures. Affected services: ${circuitList}. Operations for these services are temporarily disabled.`;
    }

    case 'high_failure_rate': {
      const stats = getTaskStats24h(1);
      const totalTasks = stats.byStatus.completed + stats.byStatus.failed;
      const failureRate = totalTasks > 0 ? ((stats.byStatus.failed / totalTasks) * 100).toFixed(1) : '0';
      return `Task failure rate in the last hour (${failureRate}%) exceeds threshold (${thresholds.failureRatePercent}%). Review recent task failures for potential issues.`;
    }

    case 'approval_backlog': {
      const stats = getTaskStats24h(1);
      return `${stats.byStatus.awaitingApproval} tasks are awaiting approval (threshold: ${thresholds.approvalBacklogCount}). Consider reviewing pending approval requests.`;
    }

    default:
      return 'An unknown alert condition was triggered.';
  }
}

/**
 * Get the component name for an alert trigger
 *
 * @param trigger - The alert trigger type
 * @returns Component name for the alert
 */
function getAlertComponent(trigger: AlertTrigger): string {
  switch (trigger) {
    case 'kill_switch_active':
      return 'ControlPlane';
    case 'circuit_breaker_open':
      return 'CircuitBreaker';
    case 'high_failure_rate':
      return 'TaskProcessor';
    case 'approval_backlog':
      return 'ApprovalQueue';
    default:
      return 'System';
  }
}

/**
 * Get suggested action for an alert trigger
 *
 * @param trigger - The alert trigger type
 * @returns Suggested action for resolution
 */
function getAlertAction(trigger: AlertTrigger): string {
  switch (trigger) {
    case 'kill_switch_active':
      return 'Use /emergency resume command to re-enable operations after resolving the issue.';
    case 'circuit_breaker_open':
      return 'Circuit will automatically reset after cooldown. Check service health.';
    case 'high_failure_rate':
      return 'Review task logs with /tasks command. Check for API or integration issues.';
    case 'approval_backlog':
      return 'Review pending approvals via the dashboard or approval-token emails.';
    default:
      return 'Contact system administrator.';
  }
}

/**
 * Dispatch alerts for triggered conditions.
 *
 * Sends alerts via email for each triggered condition. Respects
 * cooldown period to prevent alert spam.
 *
 * @param triggers - Array of alert triggers to dispatch
 * @param thresholds - Threshold values used for alert messages
 */
export async function dispatchAlerts(
  triggers: AlertTrigger[],
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Promise<void> {
  for (const trigger of triggers) {
    // Check cooldown
    if (isWithinCooldown(trigger)) {
      logger.info(`Alert dispatcher: Skipping ${trigger} alert (within cooldown)`);
      continue;
    }

    // Get alert details
    const severity = TRIGGER_SEVERITY[trigger];
    const title = TRIGGER_TITLES[trigger];
    const message = getAlertMessage(trigger, thresholds);
    const component = getAlertComponent(trigger);
    const action = getAlertAction(trigger);

    // Send alert
    logger.info(`Alert dispatcher: Sending ${severity} alert for ${trigger}`);

    const result = await sendSystemAlert({
      severity,
      title,
      message,
      component,
      action,
    });

    if (result.success) {
      // Record alert sent for cooldown tracking
      recordAlertSent(trigger);
      logger.info(`Alert dispatcher: ${trigger} alert sent successfully`);
    } else {
      logger.error(`Alert dispatcher: Failed to send ${trigger} alert: ${result.error}`);
    }
  }
}

/**
 * Run a single alert check cycle.
 *
 * Checks for alert conditions and dispatches any triggered alerts.
 * Typically called by a scheduler or polling mechanism.
 *
 * @param thresholds - Optional custom thresholds
 */
export async function runAlertCheck(
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Promise<void> {
  try {
    const triggers = await checkAlertConditions(thresholds);

    if (triggers.length > 0) {
      logger.info(`Alert dispatcher: ${triggers.length} alert condition(s) triggered: ${triggers.join(', ')}`);
      await dispatchAlerts(triggers, thresholds);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Alert dispatcher: Error during alert check: ${errorMessage}`);
  }
}

/**
 * Clear alert cooldowns (useful for testing)
 */
export function clearAlertCooldowns(): void {
  lastAlertTimes.clear();
}
