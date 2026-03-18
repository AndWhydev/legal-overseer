/**
 * Revenue Intelligence Engine — Shared Types
 *
 * All monetary values are in cents (integer) to avoid floating-point drift.
 */

// ─── Client Revenue Score ────────────────────────────────────────────────────

export type RevenueTrend = 'growing' | 'stable' | 'declining' | 'churned' | 'new'

export interface ClientRevenueScore {
  id: string
  org_id: string
  contact_id: string
  // Dimensions (0-100)
  invoice_frequency_score: number
  payment_speed_score: number
  project_value_score: number
  trend_score: number
  // Composite
  composite_score: number
  // Revenue stats (cents)
  total_revenue_cents: number
  revenue_last_90d_cents: number
  revenue_last_365d_cents: number
  avg_invoice_cents: number
  avg_payment_days: number | null
  invoice_count: number
  overdue_count: number
  // Trend
  trend: RevenueTrend
  monthly_growth_rate: number | null
  // Timestamps
  scored_at: string
  created_at: string
  updated_at: string
}

// ─── Cash Flow Projection ────────────────────────────────────────────────────

export interface CashFlowProjection {
  id: string
  org_id: string
  projection_date: string
  inflow_30d_cents: number
  inflow_60d_cents: number
  inflow_90d_cents: number
  outflow_30d_cents: number
  outflow_60d_cents: number
  outflow_90d_cents: number
  net_30d_cents: number
  net_60d_cents: number
  net_90d_cents: number
  confidence_low_30d_cents: number | null
  confidence_high_30d_cents: number | null
  breakdown: CashFlowBreakdown
  model_version: string
  computed_at: string
}

export interface CashFlowBreakdown {
  pending_invoices?: { contact_name: string; amount_cents: number; due_date: string }[]
  overdue_invoices?: { contact_name: string; amount_cents: number; days_overdue: number }[]
  projected_recurring?: { contact_name: string; amount_cents: number; basis: string }[]
}

// ─── Scope Tracking ──────────────────────────────────────────────────────────

export interface ScopeTracking {
  id: string
  org_id: string
  project_id: string | null
  project_name: string
  contact_id: string | null
  original_deliverable_count: number
  current_deliverable_count: number
  scope_delta: number
  scope_creep_pct: number
  original_value_cents: number
  current_value_cents: number
  unbilled_value_cents: number
  status: 'active' | 'completed' | 'on_hold' | 'cancelled'
  flagged: boolean
  flag_reason: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Revenue Insight ─────────────────────────────────────────────────────────

export type InsightType =
  | 'unbilled_work'
  | 'scope_creep'
  | 'overdue_collection'
  | 'retainer_renewal'
  | 'rate_opportunity'
  | 'client_churn_risk'
  | 'cash_flow_warning'
  | 'revenue_milestone'
  | 'payment_pattern'

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type InsightStatus = 'active' | 'acknowledged' | 'acted_on' | 'dismissed' | 'expired'

export interface RevenueInsight {
  id: string
  org_id: string
  insight_type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  impact_cents: number | null
  contact_id: string | null
  invoice_id: string | null
  suggested_action: string | null
  action_payload: Record<string, unknown>
  status: InsightStatus
  acknowledged_at: string | null
  acted_on_at: string | null
  expires_at: string | null
  created_at: string
}

// ─── Revenue Scenario ────────────────────────────────────────────────────────

export type ScenarioType =
  | 'rate_change'
  | 'client_churn'
  | 'new_client'
  | 'capacity_change'
  | 'seasonal_adjustment'

export interface RevenueScenario {
  id: string
  org_id: string
  name: string
  scenario_type: ScenarioType
  parameters: Record<string, unknown>
  simulations: number
  results: ScenarioResults
  projected_annual_cents: number | null
  current_annual_cents: number | null
  delta_cents: number | null
  probability_positive: number | null
  computed_at: string
  created_at: string
}

export interface ScenarioResults {
  percentiles?: { p10: number; p25: number; p50: number; p75: number; p90: number }
  distribution?: number[]
  breakdown?: Record<string, unknown>
}

// ─── Payment Pattern ─────────────────────────────────────────────────────────

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

// ─── Revenue Digest ──────────────────────────────────────────────────────────

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

export interface DigestHighlight {
  type: 'positive' | 'negative' | 'neutral'
  text: string
  impact_cents?: number
}

// ─── Revenue Radar (aggregate view) ──────────────────────────────────────────

export interface RevenueRadar {
  recoverable_total_cents: number
  insights: RevenueInsight[]
  top_clients: Array<ClientRevenueScore & { contact_name: string }>
  cash_flow: CashFlowProjection | null
  scope_alerts: ScopeTracking[]
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Convert dollars to cents (integer) */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Convert cents to dollars (for display) */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/** Format cents as currency string */
export function formatCents(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(centsToDollars(cents))
}
