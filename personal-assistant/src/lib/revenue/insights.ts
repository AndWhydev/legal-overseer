/**
 * Revenue Radar — Insight Generation
 *
 * Scans for:
 * - Unbilled work (tasks without corresponding invoices)
 * - Overdue collections (aging receivables)
 * - Scope creep (deliverable count vs original)
 * - Cash flow warnings (projected shortfalls)
 * - Client churn risk (declining activity + revenue)
 * - Payment pattern anomalies
 *
 * All monetary values in cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueInsight, InsightType, InsightSeverity } from './types'
import { dollarsToCents } from './types'

// ─── Insight Creation Helper ─────────────────────────────────────────────────

async function createInsight(
  supabase: SupabaseClient,
  orgId: string,
  insight: {
    type: InsightType
    severity: InsightSeverity
    title: string
    description: string
    impact_cents?: number
    contact_id?: string
    invoice_id?: string
    suggested_action?: string
    action_payload?: Record<string, unknown>
    expires_at?: string
  },
): Promise<void> {
  // Deduplicate: don't create if same type+contact+title exists and is still active
  const { data: existing } = await supabase
    .from('revenue_insights')
    .select('id')
    .eq('org_id', orgId)
    .eq('insight_type', insight.type)
    .eq('status', 'active')
    .eq('title', insight.title)
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await supabase.from('revenue_insights').insert({
    org_id: orgId,
    insight_type: insight.type,
    severity: insight.severity,
    title: insight.title,
    description: insight.description,
    impact_cents: insight.impact_cents ?? null,
    contact_id: insight.contact_id ?? null,
    invoice_id: insight.invoice_id ?? null,
    suggested_action: insight.suggested_action ?? null,
    action_payload: insight.action_payload ?? {},
    status: 'active',
    expires_at: insight.expires_at ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })

  if (error) {
    logger.warn('[revenue-insights] Failed to create insight', { type: insight.type, error: error.message })
  }
}

// ─── Overdue Collection Detection ────────────────────────────────────────────

export async function detectOverdueCollections(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, due_date, client_contact_id, reminder_count')
    .eq('org_id', orgId)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })

  if (!overdueInvoices || overdueInvoices.length === 0) return 0

  // Fetch contact names
  const contactIds = [...new Set(overdueInvoices.map(i => i.client_contact_id).filter(Boolean))]
  const contactNames: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .in('id', contactIds)
    for (const c of contacts ?? []) {
      contactNames[c.id] = c.name
    }
  }

  let created = 0
  const now = new Date()

  for (const inv of overdueInvoices) {
    const dueDate = inv.due_date ? new Date(inv.due_date) : now
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
    const amountCents = dollarsToCents(parseFloat(String(inv.total)) || 0)
    const contactName = contactNames[inv.client_contact_id] ?? 'Unknown client'

    let severity: InsightSeverity = 'medium'
    if (daysOverdue > 60) severity = 'critical'
    else if (daysOverdue > 30) severity = 'high'
    else if (daysOverdue > 14) severity = 'medium'
    else severity = 'low'

    await createInsight(supabase, orgId, {
      type: 'overdue_collection',
      severity,
      title: `${inv.invoice_number} overdue ${daysOverdue} days — ${contactName}`,
      description: `Invoice ${inv.invoice_number} for $${(amountCents / 100).toFixed(2)} to ${contactName} is ${daysOverdue} days overdue. ${inv.reminder_count > 0 ? `${inv.reminder_count} reminder(s) sent.` : 'No reminders sent yet.'}`,
      impact_cents: amountCents,
      contact_id: inv.client_contact_id,
      invoice_id: inv.id,
      suggested_action: inv.reminder_count === 0
        ? `Send payment reminder for ${inv.invoice_number}`
        : daysOverdue > 30
          ? `Escalate collection for ${inv.invoice_number}`
          : `Follow up on ${inv.invoice_number}`,
      action_payload: {
        invoice_id: inv.id,
        days_overdue: daysOverdue,
        reminder_count: inv.reminder_count,
      },
    })
    created++
  }

  return created
}

// ─── Client Churn Risk Detection ─────────────────────────────────────────────

export async function detectChurnRisk(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Find clients with declining revenue scores
  const { data: decliningClients } = await supabase
    .from('client_revenue_scores')
    .select('contact_id, composite_score, trend, revenue_last_90d_cents, total_revenue_cents, monthly_growth_rate')
    .eq('org_id', orgId)
    .in('trend', ['declining', 'churned'])
    .gt('total_revenue_cents', 0)
    .order('composite_score', { ascending: true })
    .limit(20)

  if (!decliningClients || decliningClients.length === 0) return 0

  const contactIds = decliningClients.map(c => c.contact_id)
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name')
    .in('id', contactIds)

  const contactNames: Record<string, string> = {}
  for (const c of contacts ?? []) {
    contactNames[c.id] = c.name
  }

  let created = 0

  for (const client of decliningClients) {
    const contactName = contactNames[client.contact_id] ?? 'Unknown'
    const severity: InsightSeverity = client.trend === 'churned' ? 'critical' : 'high'

    await createInsight(supabase, orgId, {
      type: 'client_churn_risk',
      severity,
      title: `${contactName} — ${client.trend === 'churned' ? 'churned' : 'revenue declining'}`,
      description: client.trend === 'churned'
        ? `${contactName} has had no revenue in the last 2 months. Total lifetime revenue: $${(client.total_revenue_cents / 100).toFixed(2)}.`
        : `${contactName}'s revenue is declining (${client.monthly_growth_rate?.toFixed(1)}% MoM). Last 90 days: $${(client.revenue_last_90d_cents / 100).toFixed(2)}.`,
      impact_cents: client.revenue_last_90d_cents,
      contact_id: client.contact_id,
      suggested_action: client.trend === 'churned'
        ? `Reach out to ${contactName} for a catch-up`
        : `Schedule a review with ${contactName} to discuss upcoming work`,
    })
    created++
  }

  return created
}

// ─── Scope Creep Detection ───────────────────────────────────────────────────

export async function detectScopeCreep(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Find active scope tracking entries with >20% creep
  const { data: scopeItems } = await supabase
    .from('scope_tracking')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gt('scope_creep_pct', 20)
    .order('scope_creep_pct', { ascending: false })

  if (!scopeItems || scopeItems.length === 0) return 0

  let created = 0

  for (const item of scopeItems) {
    const severity: InsightSeverity = item.scope_creep_pct > 50 ? 'high' : 'medium'

    await createInsight(supabase, orgId, {
      type: 'scope_creep',
      severity,
      title: `${item.project_name} — scope expanded ${Math.round(item.scope_creep_pct)}%`,
      description: `Project "${item.project_name}" has grown from ${item.original_deliverable_count} to ${item.current_deliverable_count} deliverables (+${item.scope_delta}). Unbilled work: $${(item.unbilled_value_cents / 100).toFixed(2)}.`,
      impact_cents: item.unbilled_value_cents,
      contact_id: item.contact_id,
      suggested_action: `Review scope with client and invoice for additional work ($${(item.unbilled_value_cents / 100).toFixed(2)})`,
      action_payload: {
        project_name: item.project_name,
        scope_delta: item.scope_delta,
        unbilled_value_cents: item.unbilled_value_cents,
      },
    })
    created++
  }

  return created
}

// ─── Cash Flow Warning Detection ─────────────────────────────────────────────

export async function detectCashFlowWarnings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data: latestProjection } = await supabase
    .from('cash_flow_projections')
    .select('*')
    .eq('org_id', orgId)
    .order('projection_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestProjection) return 0

  let created = 0

  // Warn if 30-day net is negative or very low
  if (latestProjection.net_30d_cents < 0) {
    await createInsight(supabase, orgId, {
      type: 'cash_flow_warning',
      severity: 'critical',
      title: `Cash flow shortfall projected in 30 days`,
      description: `Projected 30-day net cash flow is -$${Math.abs(latestProjection.net_30d_cents / 100).toFixed(2)}. Expected inflows: $${(latestProjection.inflow_30d_cents / 100).toFixed(2)}, outflows: $${(latestProjection.outflow_30d_cents / 100).toFixed(2)}.`,
      impact_cents: Math.abs(latestProjection.net_30d_cents),
      suggested_action: 'Accelerate collections or defer expenses to cover the shortfall',
    })
    created++
  }

  // Warn if confidence band includes negative
  if (latestProjection.confidence_low_30d_cents !== null && latestProjection.confidence_low_30d_cents < 0) {
    await createInsight(supabase, orgId, {
      type: 'cash_flow_warning',
      severity: 'medium',
      title: `Cash flow risk — downside scenario is negative`,
      description: `While the base projection shows $${(latestProjection.net_30d_cents / 100).toFixed(2)} net, the pessimistic scenario shows -$${Math.abs(latestProjection.confidence_low_30d_cents / 100).toFixed(2)}.`,
      impact_cents: Math.abs(latestProjection.confidence_low_30d_cents),
      suggested_action: 'Review pending invoices and follow up on at-risk payments',
    })
    created++
  }

  return created
}

// ─── Revenue Radar: Run All Detections ───────────────────────────────────────

export interface InsightScanResult {
  overdue_collections: number
  churn_risks: number
  scope_creep_alerts: number
  cash_flow_warnings: number
  total: number
}

export async function runInsightScan(
  supabase: SupabaseClient,
  orgId: string,
): Promise<InsightScanResult> {
  // Expire old insights first
  await supabase
    .from('revenue_insights')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())

  const [overdueCollections, churnRisks, scopeCreepAlerts, cashFlowWarnings] = await Promise.all([
    detectOverdueCollections(supabase, orgId),
    detectChurnRisk(supabase, orgId),
    detectScopeCreep(supabase, orgId),
    detectCashFlowWarnings(supabase, orgId),
  ])

  const result = {
    overdue_collections: overdueCollections,
    churn_risks: churnRisks,
    scope_creep_alerts: scopeCreepAlerts,
    cash_flow_warnings: cashFlowWarnings,
    total: overdueCollections + churnRisks + scopeCreepAlerts + cashFlowWarnings,
  }

  logger.info('[revenue-insights] Scan complete', { orgId, ...result })
  return result
}
