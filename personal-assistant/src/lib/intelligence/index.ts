/**
 * Intelligence Layer — cross-role business analytics.
 *
 * Revenue Radar: upsell opportunities, stale clients, pricing gaps
 * Client Health: per-client 0-100 scores from response times, payments, projects, comms
 * Cash Flow Prophet: forward projections from invoices, proposals, recurring
 * Capacity Oracle: workload modeling, overcommitment warnings, deadline clusters
 *
 * Each module caches results in bi_snapshots using upsert.
 */

export {
  analyzeRevenueOpportunities,
  type RevenueOpportunity,
  type RevenueRadarResult,
} from './revenue-radar'

export {
  computeClientHealth,
  type ClientHealthScore,
  type ClientHealthResult,
} from './client-health'

export {
  projectCashFlow,
  type CashFlowProjection,
  type CashFlowProphetResult,
  type CashFlowProphetAlert,
} from './cash-flow-prophet'

export {
  assessCapacity,
  type CapacityAssessment,
  type CapacityAlert,
  type CapacitySuggestion,
  type DeadlineInfo,
} from './capacity-oracle'
