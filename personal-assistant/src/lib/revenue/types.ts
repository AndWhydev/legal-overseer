/**
 * Revenue Intelligence Engine — Type Definitions
 *
 * All monetary values are in cents (integers) to avoid floating point errors.
 * Display formatting happens at the UI layer.
 */

// ─── Revenue Snapshots ───────────────────────────────────────────────────────

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RevenueSnapshot {
  id: string
  org_id: string
  period_start: string
  period_end: string
  period_type: PeriodType

  total_invoiced_cents: number
  total_collected_cents: number
  total_outstanding_cents: number
  total_overdue_cents: number
  total_cancelled_cents: number

  invoices_sent: number
  invoices_paid: number
  invoices_overdue: number
  new_clients: number

  collection_rate_pct: number
  avg_days_to_pay: number

  currency: string
  computed_at: string
  created_at: string
}

// ─── Client Revenue Scores ──────────────────────────────────────────────────

export type TrendDirection = 'growing' | 'stable' | 'declining' | 'new' | 'churned'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ClientRevenueScore {
  id: string
  org_id: string
  contact_id: string

  overall_score?: number
  composite_score?: number
  invoice_frequency_score: number
  payment_speed_score: number
  project_value_score: number
  consistency_score?: number
  trend_score: number

  total_revenue_cents: number
  revenue_last_90d_cents: number
  revenue_last_30d_cents?: number
  revenue_last_365d_cents?: number
  avg_invoice_cents: number
  total_outstanding_cents?: number

  avg_days_to_pay?: number
  avg_payment_days?: number | null
  on_time_rate_pct?: number
  invoices_total?: number
  invoices_paid?: number
  invoices_overdue?: number
  invoice_count?: number
  overdue_count?: number

  trend_direction?: TrendDirection
  trend?: TrendDirection
  risk_level?: RiskLevel
  risk_factors?: string[]
  monthly_growth_rate?: number | null

  last_invoice_date?: string | null
  first_invoice_date?: string | null
  currency?: string
  computed_at?: string
  scored_at?: string
  created_at: string
  updated_at: string
}

// ─── Revenue Insights ────────────────────────────────────────────────────────

export type InsightType =
  | 'unbilled_work'
  | 'scope_creep'
  | 'overdue_invoice'
  | 'overdue_collection'
  | 'payment_pattern'
  | 'retainer_renewal'
  | 'retainer_underuse'
  | 'retainer_overuse'
  | 'revenue_decline'
  | 'collection_opportunity'
  | 'rate_optimization'
  | 'client_churn_risk'
  | 'cash_flow_warning'

export type InsightSeverity = 'low' | 'medium' | 'high' | 'critical'
export type InsightStatus = 'active' | 'acknowledged' | 'actioned' | 'dismissed' | 'expired'

export interface RevenueInsight {
  id: string
  org_id: string

  insight_type: InsightType
  severity: InsightSeverity
  status: InsightStatus

  title: string
  description: string
  recommended_action: string | null

  amount_cents: number
  confidence: number
  evidence: Record<string, unknown>

  contact_id: string | null
  project_reference: string | null
  invoice_id: string | null

  expires_at: string | null
  actioned_at: string | null
  actioned_by: string | null
  created_at: string
  updated_at: string
}

// ─── Scope Tracking ─────────────────────────────────────────────────────────

export type ScopeStatus = 'active' | 'completed' | 'change_ordered' | 'archived'

export interface ScopeTracking {
  id: string
  org_id: string

  project_reference: string
  contact_id: string | null

  original_deliverables: number
  original_hours_estimate: number
  original_value_cents: number

  current_deliverables: number
  current_hours_logged: number
  current_value_cents: number

  deliverable_delta: number
  scope_creep_pct: number

  status: ScopeStatus
  change_order_sent: boolean
  last_reviewed_at: string | null

  created_at: string
  updated_at: string
}

// ─── Cash Flow Projections ──────────────────────────────────────────────────

export type HorizonDays = 30 | 60 | 90

export interface CashFlowBreakdown {
  pending_invoices?: Array<{ contact_name: string; amount_cents: number; due_date: string }>
  overdue_invoices?: Array<{ contact_name: string; amount_cents: number; days_overdue: number }>
  projected_recurring?: Array<{ contact_name: string; amount_cents: number; basis: string }>
}

export interface CashFlowProjection {
  id: string
  org_id: string

  projection_date: string
  horizon_days?: HorizonDays

  projected_inflow_cents?: number
  projected_outflow_cents?: number
  net_cash_flow_cents?: number

  confidence_low_cents?: number
  confidence_high_cents?: number
  confidence_pct?: number

  from_outstanding_cents?: number
  from_recurring_cents?: number
  from_pipeline_cents?: number

  sources?: Record<string, unknown>

  // Granular 30/60/90 day projections
  inflow_30d_cents?: number
  inflow_60d_cents?: number
  inflow_90d_cents?: number
  outflow_30d_cents?: number
  outflow_60d_cents?: number
  outflow_90d_cents?: number
  net_30d_cents?: number
  net_60d_cents?: number
  net_90d_cents?: number
  confidence_low_30d_cents?: number
  confidence_high_30d_cents?: number
  breakdown?: CashFlowBreakdown
  model_version?: string

  currency?: string
  computed_at: string
  created_at?: string
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

export type ScenarioType = 'rate_change' | 'client_churn' | 'capacity_change' | 'new_client' | 'custom'
export type ScenarioStatus = 'draft' | 'computed' | 'saved' | 'archived'

export interface RateChangeParams {
  type: 'rate_change'
  rate_change_pct: number
  apply_to_clients?: string[]
}

export interface ClientChurnParams {
  type: 'client_churn'
  client_ids: string[]
  churn_probability?: number
}

export interface CapacityChangeParams {
  type: 'capacity_change'
  hours_delta: number
  effective_date: string
}

export interface NewClientParams {
  type: 'new_client'
  estimated_monthly_revenue_cents: number
  probability: number
}

export interface CustomParams {
  type: 'custom'
  description: string
  revenue_impact_cents: number
}

export type ScenarioParams =
  | RateChangeParams
  | ClientChurnParams
  | CapacityChangeParams
  | NewClientParams
  | CustomParams

export interface ScenarioResults {
  percentiles?: {
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
  }
  [key: string]: unknown
}

export interface RevenueScenario {
  id: string
  org_id: string

  name: string
  description?: string | null
  scenario_type: ScenarioType
  parameters: ScenarioParams | Record<string, unknown>

  baseline_revenue_cents?: number
  projected_revenue_cents?: number
  revenue_delta_cents?: number
  revenue_delta_pct?: number

  // Alternative naming used by scenario planner
  projected_annual_cents?: number
  current_annual_cents?: number
  delta_cents?: number
  probability_positive?: number

  simulation_runs?: number
  simulations?: number
  results?: ScenarioResults
  p10_revenue_cents?: number
  p50_revenue_cents?: number
  p90_revenue_cents?: number

  impact_summary?: string | null
  affected_clients?: string[]
  risk_factors?: string[]

  status?: ScenarioStatus
  computed_at: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string
}

// ─── Retainer Agreements ────────────────────────────────────────────────────

export type RetainerStatus = 'active' | 'paused' | 'expired' | 'cancelled'

export interface RetainerAgreement {
  id: string
  org_id: string
  contact_id: string

  name: string
  monthly_amount_cents: number
  hours_allocated: number
  currency: string

  start_date: string
  end_date: string | null
  renewal_date: string | null
  auto_renew: boolean

  current_month_hours: number
  current_month_amount_cents: number

  status: RetainerStatus

  created_at: string
  updated_at: string
}

// ─── Aggregated Views ───────────────────────────────────────────────────────

export interface RevenueRadarSummary {
  total_recoverable_cents: number
  insights_by_type: Record<InsightType, number>
  insights: RevenueInsight[]
  client_count: number
  top_opportunities: RevenueInsight[]
}

export interface RevenueHealthOverview {
  snapshot: RevenueSnapshot | null
  cash_flow_30d: CashFlowProjection | null
  cash_flow_60d: CashFlowProjection | null
  cash_flow_90d: CashFlowProjection | null
  active_insights_count: number
  total_recoverable_cents: number
  top_clients: ClientRevenueScore[]
  at_risk_clients: ClientRevenueScore[]
  overdue_invoices_count: number
  collection_rate_pct: number
}

export interface WeeklyDigest {
  period_start: string
  period_end: string
  invoiced_cents: number
  collected_cents: number
  overdue_cents: number
  projected_30d_cents: number
  unbilled_cents: number
  insights: RevenueInsight[]
  client_highlights: Array<{
    contact_id: string
    contact_name: string
    trend: TrendDirection
    revenue_cents: number
  }>
}

// ─── Revenue Trend (alias for TrendDirection) ──────────────────────────────

export type RevenueTrend = TrendDirection

// ─── Payment Patterns ──────────────────────────────────────────────────────

export interface PaymentPattern {
  id: string
  org_id: string
  contact_id: string
  avg_days_to_pay: number | null
  median_days_to_pay: number | null
  fastest_payment_days: number | null
  slowest_payment_days: number | null
  preferred_payment_method: string | null
  on_time_rate: number | null
  reminder_response_rate: number | null
  optimal_reminder_day: number | null
  total_invoices_analyzed: number
  computed_at: string
  updated_at: string
}

// ─── Revenue Radar ─────────────────────────────────────────────────────────

export interface RevenueRadar {
  recoverable_total_cents: number
  insights: Array<RevenueInsight & { impact_cents?: number | null }>
  top_clients: Array<ClientRevenueScore & { contact_name?: string }>
  cash_flow: CashFlowProjection | null
  scope_alerts: ScopeTracking[]
}

// ─── Revenue Digest ────────────────────────────────────────────────────────

export interface DigestHighlight {
  type: 'positive' | 'negative' | 'neutral'
  text: string
  impact_cents?: number
}

export interface RevenueDigest {
  id: string
  org_id: string
  period_type: 'weekly' | 'monthly'
  period_start: string
  period_end: string
  invoiced_cents: number
  received_cents: number
  overdue_cents: number
  projected_30d_cents: number
  invoices_sent: number
  invoices_paid: number
  new_clients: number
  highlights: DigestHighlight[]
  delivered_at: string | null
  delivery_channel: string | null
  created_at: string
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Convert cents to display dollars with 2 decimal places */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/** Format cents as currency string */
export function formatCents(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/** Convert dollars to cents (integer) */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
