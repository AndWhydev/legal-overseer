/**
 * Daily Briefing Types for BitBit
 *
 * Type definitions for the daily briefing data aggregation module.
 * These types define the structure of the unified operational snapshot
 * that synthesizes outputs from all skills and system health.
 */

/**
 * System health section of the daily briefing
 */
export interface SystemHealth {
  /** Overall system status: healthy, degraded, or critical */
  status: 'healthy' | 'degraded' | 'critical';
  /** System uptime in milliseconds */
  uptimeMs: number;
  /** Circuit breaker statuses by service name */
  circuitBreakers: CircuitBreakerSummary[];
  /** Whether the global kill switch is active */
  killSwitchActive: boolean;
  /** List of disabled agents (if any) */
  disabledAgents: string[];
}

/**
 * Circuit breaker summary for briefing
 */
export interface CircuitBreakerSummary {
  name: string;
  state: 'closed' | 'open' | 'halfOpen';
  failureCount: number;
}

/**
 * Task summary section of the daily briefing
 */
export interface TaskSummary {
  /** Current pending tasks */
  pending: number;
  /** Tasks completed in the time window */
  completed: number;
  /** Tasks failed in the time window */
  failed: number;
  /** Tasks awaiting human approval */
  awaitingApproval: number;
  /** Breakdown by skill */
  bySkill: SkillTaskCounts;
}

/**
 * Task counts by skill
 */
export interface SkillTaskCounts {
  rd_scout: number;
  gatekeeper: number;
  ops_officer: number;
  general: number;
}

/**
 * R&D Scout section of the daily briefing
 */
export interface RdScoutSummary {
  /** When the last pipeline run occurred */
  lastRunAt: string | null;
  /** Number of opportunities found in the time window */
  opportunitiesFound: number;
  /** Trending keywords from recent runs */
  trendingKeywords: string[];
  /** When the next scheduled run will occur */
  nextRunAt: string | null;
}

/**
 * Gatekeeper section of the daily briefing
 */
export interface GatekeeperSummary {
  /** Number of reviews processed in the time window */
  reviewsProcessed: number;
  /** Number of reviews approved */
  approved: number;
  /** Number of reviews flagged for attention */
  flagged: number;
  /** Number of reviews returned for revision */
  returned: number;
}

/**
 * Ops Officer section of the daily briefing
 */
export interface OpsOfficerSummary {
  /** Number of invoices processed in the time window */
  invoicesProcessed: number;
  /** Total amount processed */
  totalAmount: number;
  /** Currency for totalAmount */
  currency: string;
  /** Number of invoices pending approval */
  pendingApprovals: number;
}

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Alert in the daily briefing
 */
export interface BriefingAlert {
  /** Severity of the alert */
  severity: AlertSeverity;
  /** Alert message */
  message: string;
  /** When the alert was generated */
  timestamp: string;
  /** Component that generated the alert */
  component?: string;
}

/**
 * Complete daily briefing structure
 *
 * This is the unified operational snapshot that provides
 * "Chess Master" visibility across all BitBit operations.
 */
export interface DailyBriefing {
  /** When the briefing was generated */
  generatedAt: string;
  /** Time window for statistics (in hours) */
  timeWindowHours: number;
  /** System health overview */
  systemHealth: SystemHealth;
  /** Task processing summary */
  taskSummary: TaskSummary;
  /** R&D Scout activity */
  rdScout: RdScoutSummary;
  /** Gatekeeper activity */
  gatekeeper: GatekeeperSummary;
  /** Ops Officer activity */
  opsOfficer: OpsOfficerSummary;
  /** Active alerts */
  alerts: BriefingAlert[];
}

/**
 * Configuration for briefing generation
 */
export interface BriefingConfig {
  /** Time window for statistics in hours (default: 24) */
  timeWindowHours?: number;
  /** Whether to include alerts (default: true) */
  includeAlerts?: boolean;
  /** Maximum number of alerts to include (default: 10) */
  maxAlerts?: number;
}

/**
 * Default briefing configuration
 */
export const DEFAULT_BRIEFING_CONFIG: Required<BriefingConfig> = {
  timeWindowHours: 24,
  includeAlerts: true,
  maxAlerts: 10,
};
