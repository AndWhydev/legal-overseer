/**
 * Anomaly detection module for BitBit
 *
 * Threshold-based anomaly detection for agent behavior.
 * Simple approach for MVP - ML can be added later if needed.
 */

import { recordAnomaly as recordTrustAnomaly } from '../db/repositories/trustScores.js';
import { createSafeLogger } from './logger.js';

const logger = createSafeLogger('AnomalyDetector');

/**
 * Anomaly severity levels
 */
export type AnomalySeverity = 'low' | 'medium' | 'high';

/**
 * Result of anomaly detection
 */
export interface AnomalyResult {
  /** Whether an anomaly was detected */
  isAnomaly: boolean;
  /** Reason for the anomaly (if detected) */
  reason?: string;
  /** Severity of the anomaly */
  severity: AnomalySeverity;
}

/**
 * Action record for sequence analysis
 */
export interface Action {
  type: string;
  timestamp: Date;
  success: boolean;
  agentId?: string;
  skillId?: string;
}

/**
 * Detect rate anomaly by comparing current rate to historical average
 *
 * Flags if current rate exceeds threshold * average rate.
 *
 * @param agentId - Agent being checked
 * @param actionType - Type of action
 * @param currentRate - Current actions per time window
 * @param historicalRates - Historical rates for comparison
 * @param threshold - Multiplier threshold (default 1.5 = 50% above average)
 * @returns Anomaly result
 */
export function detectRateAnomaly(
  agentId: string,
  actionType: string,
  currentRate: number,
  historicalRates: number[],
  threshold: number = 1.5
): AnomalyResult {
  if (historicalRates.length === 0) {
    // No history - can't detect anomaly
    return { isAnomaly: false, severity: 'low' };
  }

  const averageRate =
    historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;

  if (averageRate === 0) {
    // No historical activity - first actions are not anomalies
    return { isAnomaly: false, severity: 'low' };
  }

  const ratio = currentRate / averageRate;

  if (ratio > threshold * 2) {
    return {
      isAnomaly: true,
      reason: `Rate ${currentRate.toFixed(1)} is ${ratio.toFixed(1)}x the average (${averageRate.toFixed(1)}) for ${actionType}`,
      severity: 'high',
    };
  }

  if (ratio > threshold) {
    return {
      isAnomaly: true,
      reason: `Rate ${currentRate.toFixed(1)} is ${ratio.toFixed(1)}x the average (${averageRate.toFixed(1)}) for ${actionType}`,
      severity: 'medium',
    };
  }

  return { isAnomaly: false, severity: 'low' };
}

/**
 * Detect sequence anomalies in recent actions
 *
 * Checks for:
 * - Too many failures in a row
 * - Rapid-fire actions (too many in short time)
 * - Unusual success/failure ratio
 *
 * @param agentId - Agent being checked
 * @param recentActions - Recent actions to analyze
 * @returns Anomaly result
 */
export function detectSequenceAnomaly(
  agentId: string,
  recentActions: Action[]
): AnomalyResult {
  if (recentActions.length < 5) {
    // Not enough data
    return { isAnomaly: false, severity: 'low' };
  }

  // Check for consecutive failures
  const consecutiveFailures = countConsecutiveFailures(recentActions);
  if (consecutiveFailures >= 5) {
    return {
      isAnomaly: true,
      reason: `${consecutiveFailures} consecutive failures detected`,
      severity: 'high',
    };
  }
  if (consecutiveFailures >= 3) {
    return {
      isAnomaly: true,
      reason: `${consecutiveFailures} consecutive failures detected`,
      severity: 'medium',
    };
  }

  // Check for rapid-fire actions (more than 10 in 1 minute)
  const rapidFireCount = countActionsInWindow(recentActions, 60 * 1000);
  if (rapidFireCount > 10) {
    return {
      isAnomaly: true,
      reason: `Rapid-fire behavior: ${rapidFireCount} actions in last minute`,
      severity: 'medium',
    };
  }

  // Check overall failure rate (>50% failure is anomalous)
  const failureRate = calculateFailureRate(recentActions);
  if (failureRate > 0.5 && recentActions.length >= 10) {
    return {
      isAnomaly: true,
      reason: `High failure rate: ${(failureRate * 100).toFixed(0)}% of last ${recentActions.length} actions failed`,
      severity: 'medium',
    };
  }

  return { isAnomaly: false, severity: 'low' };
}

/**
 * Detect anomalies in amounts (e.g., invoice/payment amounts)
 *
 * Flags if amount exceeds threshold * average historical amount.
 *
 * @param amount - Current amount to check
 * @param historicalAmounts - Historical amounts for comparison
 * @param threshold - Multiplier threshold (default 2.0 = 2x average)
 * @returns Anomaly result
 */
export function detectAmountAnomaly(
  amount: number,
  historicalAmounts: number[],
  threshold: number = 2.0
): AnomalyResult {
  if (historicalAmounts.length === 0) {
    // No history - can't detect anomaly
    return { isAnomaly: false, severity: 'low' };
  }

  const average =
    historicalAmounts.reduce((a, b) => a + b, 0) / historicalAmounts.length;
  const max = Math.max(...historicalAmounts);

  // Check against average
  if (average > 0) {
    const ratioToAverage = amount / average;

    if (ratioToAverage > threshold * 2) {
      return {
        isAnomaly: true,
        reason: `Amount ${amount.toFixed(2)} is ${ratioToAverage.toFixed(1)}x the average (${average.toFixed(2)})`,
        severity: 'high',
      };
    }

    if (ratioToAverage > threshold) {
      return {
        isAnomaly: true,
        reason: `Amount ${amount.toFixed(2)} is ${ratioToAverage.toFixed(1)}x the average (${average.toFixed(2)})`,
        severity: 'medium',
      };
    }
  }

  // Also check against historical max (amount should rarely exceed 1.5x max)
  if (amount > max * 1.5 && historicalAmounts.length >= 5) {
    return {
      isAnomaly: true,
      reason: `Amount ${amount.toFixed(2)} exceeds 1.5x the historical max (${max.toFixed(2)})`,
      severity: 'medium',
    };
  }

  return { isAnomaly: false, severity: 'low' };
}

/**
 * Record an anomaly and update trust score
 *
 * @param agentId - Agent ID
 * @param skillId - Skill ID
 * @param domain - Domain
 * @param anomaly - Anomaly result to record
 */
export function recordAnomaly(
  agentId: string,
  skillId: string,
  domain: string,
  anomaly: AnomalyResult
): void {
  if (!anomaly.isAnomaly) {
    return;
  }

  logger.warn(`Anomaly detected for agent ${agentId}`, {
    skillId,
    domain,
    severity: anomaly.severity,
    reason: anomaly.reason,
  });

  // Update trust score
  recordTrustAnomaly(agentId, skillId, domain);
}

// Helper functions

function countConsecutiveFailures(actions: Action[]): number {
  // Sort by timestamp descending (most recent first)
  const sorted = [...actions].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  let count = 0;
  for (const action of sorted) {
    if (!action.success) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function countActionsInWindow(actions: Action[], windowMs: number): number {
  const now = Date.now();
  return actions.filter((a) => now - a.timestamp.getTime() < windowMs).length;
}

function calculateFailureRate(actions: Action[]): number {
  if (actions.length === 0) return 0;
  const failures = actions.filter((a) => !a.success).length;
  return failures / actions.length;
}
