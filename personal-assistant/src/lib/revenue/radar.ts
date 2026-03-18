/**
 * Revenue Radar — Aggregate View
 *
 * Combines all revenue intelligence into a single "Revenue Radar" view:
 * - Total recoverable revenue (one number)
 * - Top client scores
 * - Cash flow snapshot
 * - Active insights
 * - Scope alerts
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueRadar } from './types'

export async function getRevenueRadar(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RevenueRadar> {
  const [insightsRes, scoresRes, cashFlowRes, scopeRes] = await Promise.all([
    // Active insights
    supabase
      .from('revenue_insights')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('severity', { ascending: true }) // critical first
      .order('created_at', { ascending: false })
      .limit(20),

    // Top clients by composite score
    supabase
      .from('client_revenue_scores')
      .select('*, contacts!inner(name)')
      .eq('org_id', orgId)
      .gt('composite_score', 0)
      .order('composite_score', { ascending: false })
      .limit(10),

    // Latest cash flow projection
    supabase
      .from('cash_flow_projections')
      .select('*')
      .eq('org_id', orgId)
      .order('projection_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Flagged scope items
    supabase
      .from('scope_tracking')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .eq('flagged', true)
      .order('scope_creep_pct', { ascending: false })
      .limit(10),
  ])

  // Calculate recoverable total from insights
  const insights = (insightsRes.data ?? []) as RevenueRadar['insights']
  const recoverableTotal = insights
    .filter(i => i.impact_cents && ['unbilled_work', 'overdue_collection', 'scope_creep'].includes(i.insight_type))
    .reduce((sum, i) => sum + (i.impact_cents ?? 0), 0)

  // Map client scores with names
  const topClients = (scoresRes.data ?? []).map((row: Record<string, unknown>) => {
    const contacts = row.contacts as { name: string } | undefined
    return {
      ...row,
      contact_name: contacts?.name ?? 'Unknown',
    }
  }) as RevenueRadar['top_clients']

  return {
    recoverable_total_cents: recoverableTotal,
    insights,
    top_clients: topClients,
    cash_flow: (cashFlowRes.data as RevenueRadar['cash_flow']) ?? null,
    scope_alerts: (scopeRes.data ?? []) as RevenueRadar['scope_alerts'],
  }
}
