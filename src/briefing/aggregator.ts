/**
 * Daily Briefing Aggregator for BitBit
 *
 * Aggregates data from all skills (R&D Scout, Gatekeeper, Ops Officer)
 * plus system health into a unified daily briefing.
 */

import {
  getControlPlaneStatus,
  getAllCircuitBreakerStatuses,
  hasOpenCircuit,
  getOpenCircuits,
  type CircuitBreakerStatus,
} from '../governance/index.js';
import {
  getTaskStats24h,
  getCompletedTaskOutputs,
} from '../db/repositories/tasks.js';
import type {
  DailyBriefing,
  BriefingConfig,
  SystemHealth,
  TaskSummary,
  RdScoutSummary,
  GatekeeperSummary,
  OpsOfficerSummary,
  BriefingAlert,
  CircuitBreakerSummary,
  DEFAULT_BRIEFING_CONFIG,
} from './types.js';

/**
 * Aggregate system health status
 */
function aggregateSystemHealth(): SystemHealth {
  const controlPlane = getControlPlaneStatus();
  const circuitBreakers = getAllCircuitBreakerStatuses();

  // Convert circuit breaker statuses to summaries
  const breakerSummaries: CircuitBreakerSummary[] = [];
  for (const [name, status] of circuitBreakers) {
    breakerSummaries.push({
      name,
      state: status.state,
      failureCount: status.stats.failures,
    });
  }

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (controlPlane.globalKillSwitch) {
    status = 'critical';
  } else if (hasOpenCircuit() || controlPlane.disabledAgents.length > 0) {
    status = 'degraded';
  }

  return {
    status,
    uptimeMs: controlPlane.uptimeMs,
    circuitBreakers: breakerSummaries,
    killSwitchActive: controlPlane.globalKillSwitch,
    disabledAgents: controlPlane.disabledAgents,
  };
}

/**
 * Aggregate task summary statistics
 */
function aggregateTaskSummary(hours: number): TaskSummary {
  const stats = getTaskStats24h(hours);

  return {
    pending: stats.byStatus.pending,
    completed: stats.byStatus.completed,
    failed: stats.byStatus.failed,
    awaitingApproval: stats.byStatus.awaitingApproval,
    bySkill: stats.bySkill,
  };
}

/**
 * Aggregate R&D Scout statistics from task outputs
 */
function aggregateRdScout(hours: number): RdScoutSummary {
  const outputs = getCompletedTaskOutputs('rd_scout', hours);

  let lastRunAt: string | null = null;
  let opportunitiesFound = 0;
  const keywordCounts = new Map<string, number>();

  for (const output of outputs) {
    try {
      const data = typeof output === 'string' ? JSON.parse(output) : output;

      // Track last run time
      if (data.completedAt && (!lastRunAt || data.completedAt > lastRunAt)) {
        lastRunAt = data.completedAt;
      }

      // Count opportunities
      if (data.opportunitiesFound !== undefined) {
        opportunitiesFound += data.opportunitiesFound;
      } else if (data.opportunities && Array.isArray(data.opportunities)) {
        opportunitiesFound += data.opportunities.length;
      }

      // Aggregate keywords
      if (data.keywords && Array.isArray(data.keywords)) {
        for (const keyword of data.keywords) {
          keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
        }
      }
    } catch {
      // Skip malformed outputs
    }
  }

  // Get top 5 trending keywords
  const trendingKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword]) => keyword);

  return {
    lastRunAt,
    opportunitiesFound,
    trendingKeywords,
    nextRunAt: null, // Will be populated from scheduler if available
  };
}

/**
 * Aggregate Gatekeeper statistics from task outputs
 */
function aggregateGatekeeper(hours: number): GatekeeperSummary {
  const outputs = getCompletedTaskOutputs('gatekeeper', hours);

  let reviewsProcessed = 0;
  let approved = 0;
  let flagged = 0;
  let returned = 0;

  for (const output of outputs) {
    try {
      const data = typeof output === 'string' ? JSON.parse(output) : output;

      reviewsProcessed++;

      if (data.decision === 'approved' || data.approved === true) {
        approved++;
      } else if (data.decision === 'flagged' || data.flagged === true) {
        flagged++;
      } else if (data.decision === 'returned' || data.returned === true) {
        returned++;
      }
    } catch {
      // Skip malformed outputs
    }
  }

  return {
    reviewsProcessed,
    approved,
    flagged,
    returned,
  };
}

/**
 * Aggregate Ops Officer statistics from task outputs
 */
function aggregateOpsOfficer(hours: number): OpsOfficerSummary {
  const outputs = getCompletedTaskOutputs('ops_officer', hours);

  let invoicesProcessed = 0;
  let totalAmount = 0;
  let pendingApprovals = 0;
  let currency = 'USD';

  for (const output of outputs) {
    try {
      const data = typeof output === 'string' ? JSON.parse(output) : output;

      if (data.invoiceProcessed === true || data.type === 'invoice') {
        invoicesProcessed++;

        if (data.amount !== undefined) {
          totalAmount += data.amount;
        }

        if (data.currency) {
          currency = data.currency;
        }

        if (data.status === 'pending_approval' || data.awaitingApproval === true) {
          pendingApprovals++;
        }
      }
    } catch {
      // Skip malformed outputs
    }
  }

  return {
    invoicesProcessed,
    totalAmount,
    currency,
    pendingApprovals,
  };
}

/**
 * Generate alerts based on current system state
 */
function generateAlerts(
  systemHealth: SystemHealth,
  taskSummary: TaskSummary,
  maxAlerts: number
): BriefingAlert[] {
  const alerts: BriefingAlert[] = [];
  const now = new Date().toISOString();

  // Check for critical system issues
  if (systemHealth.killSwitchActive) {
    alerts.push({
      severity: 'critical',
      message: 'Global kill switch is active - all operations halted',
      timestamp: now,
      component: 'ControlPlane',
    });
  }

  // Check for open circuit breakers
  const openCircuits = getOpenCircuits();
  for (const circuit of openCircuits) {
    alerts.push({
      severity: 'error',
      message: `Circuit breaker "${circuit}" is open - service unavailable`,
      timestamp: now,
      component: circuit,
    });
  }

  // Check for disabled agents
  for (const agent of systemHealth.disabledAgents) {
    alerts.push({
      severity: 'warning',
      message: `Agent "${agent}" is disabled`,
      timestamp: now,
      component: agent,
    });
  }

  // Check for high failure rate
  const totalTasks = taskSummary.completed + taskSummary.failed;
  if (totalTasks > 0) {
    const failureRate = taskSummary.failed / totalTasks;
    if (failureRate > 0.5) {
      alerts.push({
        severity: 'error',
        message: `High task failure rate: ${(failureRate * 100).toFixed(1)}%`,
        timestamp: now,
        component: 'TaskProcessor',
      });
    } else if (failureRate > 0.2) {
      alerts.push({
        severity: 'warning',
        message: `Elevated task failure rate: ${(failureRate * 100).toFixed(1)}%`,
        timestamp: now,
        component: 'TaskProcessor',
      });
    }
  }

  // Check for tasks awaiting approval
  if (taskSummary.awaitingApproval > 5) {
    alerts.push({
      severity: 'warning',
      message: `${taskSummary.awaitingApproval} tasks awaiting human approval`,
      timestamp: now,
      component: 'ApprovalQueue',
    });
  }

  // Limit alerts
  return alerts.slice(0, maxAlerts);
}

/**
 * Aggregate daily briefing from all sources
 *
 * @param config - Optional configuration for the briefing
 * @returns Complete daily briefing
 */
export async function aggregateDailyBriefing(
  config: BriefingConfig = {}
): Promise<DailyBriefing> {
  const mergedConfig = {
    timeWindowHours: config.timeWindowHours ?? 24,
    includeAlerts: config.includeAlerts ?? true,
    maxAlerts: config.maxAlerts ?? 10,
  };

  const hours = mergedConfig.timeWindowHours;

  // Aggregate all sections
  const systemHealth = aggregateSystemHealth();
  const taskSummary = aggregateTaskSummary(hours);
  const rdScout = aggregateRdScout(hours);
  const gatekeeper = aggregateGatekeeper(hours);
  const opsOfficer = aggregateOpsOfficer(hours);

  // Generate alerts if enabled
  const alerts = mergedConfig.includeAlerts
    ? generateAlerts(systemHealth, taskSummary, mergedConfig.maxAlerts)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    timeWindowHours: hours,
    systemHealth,
    taskSummary,
    rdScout,
    gatekeeper,
    opsOfficer,
    alerts,
  };
}
