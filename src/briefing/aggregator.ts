/**
 * Daily Briefing aggregator — Legal Overseer.
 *
 * Builds the unified snapshot the scheduler emails to the managing
 * partner. Reads directly from the database (no model calls) so the
 * briefing is cheap, repeatable, and safe to render synchronously in
 * a cron tick.
 */

import {
  getControlPlaneStatus,
  getAllCircuitBreakerStatuses,
  hasOpenCircuit,
} from '../governance/index.js';
import { getDatabase } from '../db/connection.js';
import { verifyAuditChain } from '../compliance/audit.js';
import { listUpcoming } from '../db/repositories/deadlines.js';
import type {
  BillingStats,
  BriefingAlert,
  CircuitBreakerSummary,
  DailyBriefing,
  DeadlineCalendarStats,
  MatterStats,
  ReviewQueueStats,
  SystemHealth,
} from './types.js';

function aggregateSystemHealth(): SystemHealth {
  const controlPlane = getControlPlaneStatus();
  const circuitBreakers = getAllCircuitBreakerStatuses();
  const breakerSummaries: CircuitBreakerSummary[] = [];
  for (const [name, status] of circuitBreakers) {
    breakerSummaries.push({ name, state: status.state, failureCount: status.stats.failures });
  }

  const chain = verifyAuditChain();
  let status: SystemHealth['status'] = 'healthy';
  if (controlPlane.globalKillSwitch || !chain.ok) {
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
    auditChainOk: chain.ok,
    auditChainBreak: chain.ok ? null : chain.firstBreak,
  };
}

function aggregateMatterStats(windowHours: number): MatterStats {
  const db = getDatabase();
  const totals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'open'    THEN 1 ELSE 0 END) AS openTotal,
         SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) AS onHold
       FROM matters`,
    )
    .get() as { openTotal: number | null; onHold: number | null };

  const windowRows = db
    .prepare(
      `SELECT
         SUM(CASE WHEN opened_at > datetime('now', ?) THEN 1 ELSE 0 END) AS newInWindow,
         SUM(CASE WHEN closed_at > datetime('now', ?) THEN 1 ELSE 0 END) AS closedInWindow
       FROM matters`,
    )
    .get(`-${windowHours} hours`, `-${windowHours} hours`) as {
    newInWindow: number | null;
    closedInWindow: number | null;
  };

  return {
    openTotal: totals.openTotal ?? 0,
    onHold: totals.onHold ?? 0,
    newInWindow: windowRows.newInWindow ?? 0,
    closedInWindow: windowRows.closedInWindow ?? 0,
  };
}

function aggregateReviewQueue(windowHours: number): ReviewQueueStats {
  const db = getDatabase();
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending'                                              THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'pending'  AND created_at < datetime('now', '-48 hours') THEN 1 ELSE 0 END) AS stuck,
         SUM(CASE WHEN status = 'approved' AND reviewed_at > datetime('now', ?)        THEN 1 ELSE 0 END) AS approvedInWindow,
         SUM(CASE WHEN status = 'rejected' AND reviewed_at > datetime('now', ?)        THEN 1 ELSE 0 END) AS rejectedInWindow,
         SUM(CASE WHEN status = 'sent'     AND reviewed_at > datetime('now', ?)        THEN 1 ELSE 0 END) AS sentInWindow
       FROM review_queue`,
    )
    .get(`-${windowHours} hours`, `-${windowHours} hours`, `-${windowHours} hours`) as {
    pending: number | null;
    stuck: number | null;
    approvedInWindow: number | null;
    rejectedInWindow: number | null;
    sentInWindow: number | null;
  };
  return {
    pending: counts.pending ?? 0,
    stuck: counts.stuck ?? 0,
    approvedInWindow: counts.approvedInWindow ?? 0,
    rejectedInWindow: counts.rejectedInWindow ?? 0,
    sentInWindow: counts.sentInWindow ?? 0,
  };
}

function aggregateDeadlines(): DeadlineCalendarStats {
  const db = getDatabase();
  const upcoming = listUpcoming(14);
  const overdue = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deadlines WHERE status = 'open' AND due_date < date('now')`,
    )
    .get() as { n: number };
  const limitations = upcoming.filter((d) => d.deadline_type === 'limitation').length;

  return {
    upcomingCount: upcoming.length,
    upcomingLimitations: limitations,
    overdueCount: overdue.n,
  };
}

function aggregateBilling(windowHours: number): BillingStats {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN kind = 'ai_run' AND created_at > datetime('now', ?) THEN 1 ELSE 0 END) AS aiRunsInWindow,
         SUM(CASE WHEN kind = 'ai_run' AND created_at > datetime('now', ?) THEN cost_usd ELSE 0 END) AS aiSpendUsdInWindow,
         SUM(CASE WHEN kind = 'ai_run' AND created_at > datetime('now', ?) THEN duration_seconds ELSE 0 END) AS aiSecondsInWindow,
         SUM(CASE WHEN kind = 'lawyer_time' AND created_at > datetime('now', ?) THEN duration_seconds ELSE 0 END) AS lawyerSecondsInWindow
       FROM billing_log`,
    )
    .get(
      `-${windowHours} hours`,
      `-${windowHours} hours`,
      `-${windowHours} hours`,
      `-${windowHours} hours`,
    ) as {
    aiRunsInWindow: number | null;
    aiSpendUsdInWindow: number | null;
    aiSecondsInWindow: number | null;
    lawyerSecondsInWindow: number | null;
  };

  const stale = db
    .prepare(
      `SELECT COUNT(*) AS n FROM matters m
       WHERE m.status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM billing_log b
           WHERE b.matter_id = m.id
             AND b.created_at > datetime('now', ?)
         )`,
    )
    .get(`-${windowHours} hours`) as { n: number };

  return {
    aiRunsInWindow: row.aiRunsInWindow ?? 0,
    aiSpendUsdInWindow: row.aiSpendUsdInWindow ?? 0,
    aiSecondsInWindow: row.aiSecondsInWindow ?? 0,
    lawyerSecondsInWindow: row.lawyerSecondsInWindow ?? 0,
    staleMatters: stale.n,
  };
}

function buildAlerts(
  health: SystemHealth,
  reviewQueue: ReviewQueueStats,
  deadlines: DeadlineCalendarStats,
): BriefingAlert[] {
  const alerts: BriefingAlert[] = [];
  if (!health.auditChainOk) {
    alerts.push({
      severity: 'critical',
      title: 'Audit chain break detected',
      detail: health.auditChainBreak ?? 'Audit chain verification failed.',
    });
  }
  if (health.killSwitchActive) {
    alerts.push({
      severity: 'critical',
      title: 'Global kill switch active',
      detail: 'All AI execution is currently disabled.',
    });
  }
  if (deadlines.upcomingLimitations > 0) {
    alerts.push({
      severity: 'critical',
      title: `${deadlines.upcomingLimitations} limitation period(s) within 14 days`,
      detail: 'Review the deadline calendar — a missed limitation is malpractice.',
    });
  }
  if (deadlines.overdueCount > 0) {
    alerts.push({
      severity: 'warning',
      title: `${deadlines.overdueCount} deadline(s) overdue`,
      detail: 'Resolve or waive them on the deadline calendar.',
    });
  }
  if (reviewQueue.stuck > 0) {
    alerts.push({
      severity: 'warning',
      title: `${reviewQueue.stuck} review queue item(s) pending > 48h`,
      detail: 'Outputs are waiting on a lawyer to approve or reject.',
    });
  }
  return alerts;
}

export function aggregateDailyBriefing(windowHours = 24): DailyBriefing {
  const systemHealth = aggregateSystemHealth();
  const matters = aggregateMatterStats(windowHours);
  const reviewQueue = aggregateReviewQueue(windowHours);
  const deadlines = aggregateDeadlines();
  const billing = aggregateBilling(windowHours);
  const alerts = buildAlerts(systemHealth, reviewQueue, deadlines);

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    systemHealth,
    matters,
    reviewQueue,
    deadlines,
    billing,
    alerts,
  };
}
