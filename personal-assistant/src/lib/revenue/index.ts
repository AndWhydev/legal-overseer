<<<<<<< HEAD
/**
 * @bitbit/revenue — Revenue Intelligence Engine
 *
 * Proactive revenue intelligence: scoring, cash flow projections,
 * insight generation, scenario planning, payment patterns, and digests.
 */

// Types
export type {
  ClientRevenueScore,
  RevenueTrend,
  CashFlowProjection,
  CashFlowBreakdown,
  ScopeTracking,
  RevenueInsight,
  InsightType,
  InsightSeverity,
  InsightStatus,
  RevenueScenario,
  ScenarioType,
  ScenarioResults,
  PaymentPattern,
  RevenueDigest,
  DigestHighlight,
  RevenueRadar,
} from './types'

export { dollarsToCents, centsToDollars, formatCents } from './types'

// Client Revenue Scoring
export { scoreClient, scoreAllClients } from './scoring'

// Cash Flow Prophet
export { projectCashFlow, computeAndStoreCashFlow } from './cash-flow'

// Revenue Insights (Radar)
export {
  detectOverdueCollections,
  detectChurnRisk,
  detectScopeCreep,
  detectCashFlowWarnings,
  runInsightScan,
  type InsightScanResult,
} from './insights'

// Scenario Planner
export { runScenario } from './scenarios'

// Payment Patterns
export { analyzePaymentPattern, analyzeAllPaymentPatterns } from './payment-patterns'

// Digest Generator
export { generateDigest } from './digest'

// Revenue Radar (aggregate)
export { getRevenueRadar } from './radar'

// Retainer Monitoring
export { detectRetainerRenewals } from './retainer-monitor'

// Collection Acceleration
export { generateCollectionActions, recordReminderSent } from './collection-accelerator'
=======
// Revenue Intelligence Engine — barrel export

export * from './types'
export { computeSnapshot, saveSnapshot, refreshSnapshots, getLatestSnapshot, getSnapshotHistory } from './snapshot-engine'
export { refreshClientScores, getClientScores, getAtRiskClients } from './client-scoring'
export { detectUnbilledWork, saveUnbilledInsights, runUnbilledDetection } from './unbilled-detector'
export { detectScopeCreep, saveScopeCreepInsights, initializeScope, updateScopeFromTasks } from './scope-monitor'
export { findOverdueInvoices, getCollectionSummary, analyzePaymentPattern, runCollectionAnalysis } from './collection-engine'
export { computeCashFlowProjections, saveCashFlowProjections, getLatestProjections, runCashFlowProjection } from './cashflow-engine'
export { computeScenario, getScenarios } from './scenario-planner'
export { generateWeeklyDigest, formatDigestText, storeDigestInMemory, runWeeklyDigest } from './weekly-digest'
export { checkRetainers, saveRetainerInsights, runRetainerMonitoring } from './retainer-monitor'
export { getRevenueHealthOverview, getRevenueRadar, updateInsightStatus } from './health-overview'
>>>>>>> v1.5-marketing-launch
