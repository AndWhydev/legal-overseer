/**
 * Daily Briefing — type definitions (Legal Overseer).
 *
 * Structure of the daily snapshot the scheduler emails to the
 * managing partner. Centred on the four legal surfaces:
 *
 *   - Matter list      (new / closed / paused since last briefing)
 *   - Review queue     (pending, stuck-on-lawyer, recently approved)
 *   - Deadline calendar (next 14 days)
 *   - Billing tracker  (AI spend + lawyer time totals)
 *
 * Plus system health (governance circuit breakers, audit-chain
 * integrity).
 */

export interface BriefingConfig {
  /** ISO-8601 cron expression for delivery (default 08:00 daily). */
  cron: string;
  /** Hours of history to include in the snapshot. */
  windowHours: number;
  /** Recipient address (defaults to ADMIN_EMAIL). */
  to: string | null;
}

export const DEFAULT_BRIEFING_CONFIG: BriefingConfig = {
  cron: '0 8 * * *',
  windowHours: 24,
  to: null,
};

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface CircuitBreakerSummary {
  name: string;
  state: 'closed' | 'open' | 'halfOpen';
  failureCount: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptimeMs: number;
  circuitBreakers: CircuitBreakerSummary[];
  killSwitchActive: boolean;
  disabledAgents: string[];
  /** Whether the legal_audit_log hash chain is intact. */
  auditChainOk: boolean;
  /** Description of the first chain break, if any. */
  auditChainBreak: string | null;
}

export interface MatterStats {
  openTotal: number;
  newInWindow: number;
  closedInWindow: number;
  onHold: number;
}

export interface ReviewQueueStats {
  pending: number;
  /** Pending more than 48h — the lawyer hasn't looked. */
  stuck: number;
  approvedInWindow: number;
  rejectedInWindow: number;
  sentInWindow: number;
}

export interface DeadlineCalendarStats {
  /** Open deadlines in the next 14 days. */
  upcomingCount: number;
  /** Limitation-period deadlines in the next 14 days (worst case). */
  upcomingLimitations: number;
  /** Open deadlines already past their due date. */
  overdueCount: number;
}

export interface BillingStats {
  aiRunsInWindow: number;
  aiSpendUsdInWindow: number;
  aiSecondsInWindow: number;
  lawyerSecondsInWindow: number;
  /** Open matters with no billing activity in the window. */
  staleMatters: number;
}

export interface BriefingAlert {
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface DailyBriefing {
  generatedAt: string;
  windowHours: number;
  systemHealth: SystemHealth;
  matters: MatterStats;
  reviewQueue: ReviewQueueStats;
  deadlines: DeadlineCalendarStats;
  billing: BillingStats;
  alerts: BriefingAlert[];
}
