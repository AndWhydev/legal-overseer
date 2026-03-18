/**
 * Revenue Health Overview
 *
 * Aggregates all revenue intelligence modules into a single
 * comprehensive health overview for the dashboard and agent.
 *
 * This is the "Revenue Radar" — the single view that shows
 * recoverable revenue and actionable opportunities.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  RevenueHealthOverview,
  RevenueRadarSummary,
  RevenueInsight,
  InsightType,
  ClientRevenueScore,
  CashFlowProjection,
  RevenueSnapshot,
} from './types'

/**
 * Build a complete revenue health overview.
 * Single batch of queries to minimize latency.
 */
export async function getRevenueHealthOverview(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RevenueHealthOverview> {
  try {
    // Batch all queries
    const [
      snapshotResult,
      projectionsResult,
      insightsResult,
      topClientsResult,
      riskClientsResult,
      overdueCountResult,
    ] = await Promise.all([
      // Latest monthly snapshot
      supabase
        .from('revenue_snapshots')
        .select('*')
        .eq('org_id', orgId)
        .eq('period_type', 'monthly')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Latest projections (all horizons)
      supabase
        .from('cash_flow_projections')
        .select('*')
        .eq('org_id', orgId)
        .order('projection_date', { ascending: false })
        .limit(3),

      // Active insights
      supabase
        .from('revenue_insights')
        .select('*')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('amount_cents', { ascending: false }),

      // Top clients by score
      supabase
        .from('client_revenue_scores')
        .select('*')
        .eq('org_id', orgId)
        .order('overall_score', { ascending: false })
        .limit(5),

      // At-risk clients
      supabase
        .from('client_revenue_scores')
        .select('*')
        .eq('org_id', orgId)
        .in('risk_level', ['high', 'critical'])
        .order('overall_score', { ascending: true })
        .limit(5),

      // Overdue invoice count
      supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'overdue'),
    ])

    const snapshot = snapshotResult.data as RevenueSnapshot | null
    const projections = (projectionsResult.data ?? []) as CashFlowProjection[]
    const insights = (insightsResult.data ?? []) as RevenueInsight[]
    const topClients = (topClientsResult.data ?? []) as ClientRevenueScore[]
    const riskClients = (riskClientsResult.data ?? []) as ClientRevenueScore[]

    // Calculate total recoverable
    const totalRecoverableCents = insights
      .filter(i => ['unbilled_work', 'scope_creep', 'collection_opportunity'].includes(i.insight_type))
      .reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)

    // Find projections by horizon
    const cf30 = projections.find(p => p.horizon_days === 30) ?? null
    const cf60 = projections.find(p => p.horizon_days === 60) ?? null
    const cf90 = projections.find(p => p.horizon_days === 90) ?? null

    return {
      snapshot,
      cash_flow_30d: cf30,
      cash_flow_60d: cf60,
      cash_flow_90d: cf90,
      active_insights_count: insights.length,
      total_recoverable_cents: totalRecoverableCents,
      top_clients: topClients,
      at_risk_clients: riskClients,
      overdue_invoices_count: overdueCountResult.count ?? 0,
      collection_rate_pct: snapshot?.collection_rate_pct ?? 0,
    }
  } catch (err) {
    logger.error('[health-overview] Failed to build overview', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })

    return {
      snapshot: null,
      cash_flow_30d: null,
      cash_flow_60d: null,
      cash_flow_90d: null,
      active_insights_count: 0,
      total_recoverable_cents: 0,
      top_clients: [],
      at_risk_clients: [],
      overdue_invoices_count: 0,
      collection_rate_pct: 0,
    }
  }
}

/**
 * Build the Revenue Radar summary — focused on recoverable revenue.
 */
export async function getRevenueRadar(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RevenueRadarSummary> {
  try {
    const { data, error } = await supabase
      .from('revenue_insights')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('amount_cents', { ascending: false })

    if (error) {
      logger.warn('[health-overview] Failed to get radar data', { error: error.message })
      return {
        total_recoverable_cents: 0,
        insights_by_type: {} as Record<InsightType, number>,
        insights: [],
        client_count: 0,
        top_opportunities: [],
      }
    }

    const insights = (data ?? []) as RevenueInsight[]

    // Group by type
    const byType: Record<string, number> = {}
    const clientIds = new Set<string>()

    for (const insight of insights) {
      byType[insight.insight_type] = (byType[insight.insight_type] ?? 0) + 1
      if (insight.contact_id) clientIds.add(insight.contact_id)
    }

    const totalRecoverableCents = insights
      .filter(i => ['unbilled_work', 'scope_creep', 'overdue_invoice', 'collection_opportunity'].includes(i.insight_type))
      .reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)

    // Top opportunities by amount
    const topOpportunities = insights
      .filter(i => (i.amount_cents ?? 0) > 0)
      .slice(0, 5)

    return {
      total_recoverable_cents: totalRecoverableCents,
      insights_by_type: byType as Record<InsightType, number>,
      insights,
      client_count: clientIds.size,
      top_opportunities: topOpportunities,
    }
  } catch (err) {
    logger.error('[health-overview] Failed to get radar', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      total_recoverable_cents: 0,
      insights_by_type: {} as Record<InsightType, number>,
      insights: [],
      client_count: 0,
      top_opportunities: [],
    }
  }
}

/**
 * Update insight status (acknowledge, action, dismiss).
 */
export async function updateInsightStatus(
  supabase: SupabaseClient,
  insightId: string,
  status: 'acknowledged' | 'actioned' | 'dismissed',
  userId?: string,
): Promise<boolean> {
  const update: Record<string, unknown> = { status }
  if (status === 'actioned') {
    update.actioned_at = new Date().toISOString()
    if (userId) update.actioned_by = userId
  }

  const { error } = await supabase
    .from('revenue_insights')
    .update(update)
    .eq('id', insightId)

  if (error) {
    logger.warn('[health-overview] Failed to update insight', { error: error.message })
    return false
  }

  return true
}
