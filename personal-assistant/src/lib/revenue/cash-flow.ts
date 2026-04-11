/**
 * Cash Flow Prophet
 *
 * Projects 30/60/90 day cash flow from:
 * 1. Pending invoices (expected inflows)
 * 2. Overdue invoices (at-risk inflows, discounted by collection probability)
 * 3. Historical recurring patterns (exponential smoothing)
 *
 * All monetary values in cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { CashFlowProjection, CashFlowBreakdown } from './types'
import { dollarsToCents } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Exponential smoothing alpha for recurring revenue forecasting */
const SMOOTHING_ALPHA = 0.3

/** Collection probability discount for overdue invoices */
const OVERDUE_DISCOUNT: Record<string, number> = {
  '0-7': 0.95,   // 1 week overdue: 95% likely to collect
  '7-14': 0.85,
  '14-30': 0.70,
  '30-60': 0.50,
  '60-90': 0.30,
  '90+': 0.15,
}

function getOverdueDiscount(daysOverdue: number): number {
  if (daysOverdue <= 7) return OVERDUE_DISCOUNT['0-7']
  if (daysOverdue <= 14) return OVERDUE_DISCOUNT['7-14']
  if (daysOverdue <= 30) return OVERDUE_DISCOUNT['14-30']
  if (daysOverdue <= 60) return OVERDUE_DISCOUNT['30-60']
  if (daysOverdue <= 90) return OVERDUE_DISCOUNT['60-90']
  return OVERDUE_DISCOUNT['90+']
}

// ─── Main Projection Function ────────────────────────────────────────────────

export async function projectCashFlow(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Omit<CashFlowProjection, 'id'>> {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // Fetch pending/sent invoices (expected inflows)
  const { data: pendingInvoices } = await supabase
    .from('invoices')
    .select('id, total, due_date, status, client_contact_id')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed', 'draft'])
    .order('due_date', { ascending: true })

  // Fetch overdue invoices
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, total, due_date, status, client_contact_id')
    .eq('org_id', orgId)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })

  // Fetch paid invoices for recurring revenue estimation (last 12 months)
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('id, total, paid_date, client_contact_id')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', yearAgo.toISOString().slice(0, 10))
    .order('paid_date', { ascending: true })

  // Fetch contact names for breakdown
  const contactIds = new Set<string>()
  for (const inv of [...(pendingInvoices ?? []), ...(overdueInvoices ?? [])]) {
    if (inv.client_contact_id) contactIds.add(inv.client_contact_id)
  }

  const contactNames: Record<string, string> = {}
  if (contactIds.size > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .in('id', [...contactIds])
    for (const c of contacts ?? []) {
      contactNames[c.id] = c.name
    }
  }

  // ─── Calculate pending inflows by time window ───
  let inflow30d = 0
  let inflow60d = 0
  let inflow90d = 0

  const breakdown: CashFlowBreakdown = {
    pending_invoices: [],
    overdue_invoices: [],
    projected_recurring: [],
  }

  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  for (const inv of pendingInvoices ?? []) {
    const amountCents = dollarsToCents(parseFloat(String(inv.total)) || 0)
    const dueDate = inv.due_date ? new Date(inv.due_date) : thirtyDays // default: 30 days

    breakdown.pending_invoices!.push({
      contact_name: contactNames[inv.client_contact_id] ?? 'Unknown',
      amount_cents: amountCents,
      due_date: inv.due_date ?? thirtyDays.toISOString().slice(0, 10),
    })

    if (dueDate <= thirtyDays) {
      inflow30d += amountCents
    } else if (dueDate <= sixtyDays) {
      inflow60d += amountCents
    } else if (dueDate <= ninetyDays) {
      inflow90d += amountCents
    }
  }

  // ─── Calculate overdue inflows (discounted) ───
  for (const inv of overdueInvoices ?? []) {
    const amountCents = dollarsToCents(parseFloat(String(inv.total)) || 0)
    const dueDate = inv.due_date ? new Date(inv.due_date) : now
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
    const discount = getOverdueDiscount(daysOverdue)
    const discountedAmount = Math.round(amountCents * discount)

    breakdown.overdue_invoices!.push({
      contact_name: contactNames[inv.client_contact_id] ?? 'Unknown',
      amount_cents: amountCents,
      days_overdue: daysOverdue,
    })

    // Overdue invoices expected to be collected within 30 days
    inflow30d += discountedAmount
  }

  // ─── Estimate recurring revenue (exponential smoothing) ───
  const monthlyTotals: number[] = []
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

    const monthTotal = (paidInvoices ?? [])
      .filter(inv => {
        const pd = new Date(inv.paid_date)
        return pd >= start && pd <= end
      })
      .reduce((sum, inv) => sum + dollarsToCents(parseFloat(String(inv.total)) || 0), 0)

    monthlyTotals.push(monthTotal)
  }

  // Exponential smoothing forecast
  let smoothed = monthlyTotals[0] || 0
  for (let i = 1; i < monthlyTotals.length; i++) {
    smoothed = SMOOTHING_ALPHA * monthlyTotals[i] + (1 - SMOOTHING_ALPHA) * smoothed
  }

  const monthlyForecast = Math.round(smoothed)

  // Add recurring revenue not already covered by pending invoices
  const pendingTotal = inflow30d + inflow60d + inflow90d
  const expectedRecurring90d = monthlyForecast * 3
  const recurringGap = Math.max(0, expectedRecurring90d - pendingTotal)

  if (recurringGap > 0) {
    const recurringPer30d = Math.round(recurringGap / 3)
    inflow30d += recurringPer30d
    inflow60d += recurringPer30d
    inflow90d += recurringPer30d

    breakdown.projected_recurring!.push({
      contact_name: 'Recurring revenue (forecast)',
      amount_cents: recurringGap,
      basis: `Exponential smoothing (α=${SMOOTHING_ALPHA})`,
    })
  }

  // ─── Cumulative totals ───
  // 60d includes 30d, 90d includes 60d
  const cumInflow30d = inflow30d
  const cumInflow60d = inflow30d + inflow60d
  const cumInflow90d = inflow30d + inflow60d + inflow90d

  // Outflows not tracked yet (placeholder for future expansion)
  const outflow30d = 0
  const outflow60d = 0
  const outflow90d = 0

  // ─── Confidence bands ───
  const varianceFromRecurring = monthlyTotals.length > 1
    ? Math.sqrt(
        monthlyTotals.reduce((sum, v) => sum + (v - smoothed) ** 2, 0) / monthlyTotals.length,
      )
    : cumInflow30d * 0.2

  const confidenceLow30d = Math.round(cumInflow30d - varianceFromRecurring * 1.5)
  const confidenceHigh30d = Math.round(cumInflow30d + varianceFromRecurring * 1.5)

  return {
    org_id: orgId,
    projection_date: today,
    inflow_30d_cents: cumInflow30d,
    inflow_60d_cents: cumInflow60d,
    inflow_90d_cents: cumInflow90d,
    outflow_30d_cents: outflow30d,
    outflow_60d_cents: outflow60d,
    outflow_90d_cents: outflow90d,
    net_30d_cents: cumInflow30d - outflow30d,
    net_60d_cents: cumInflow60d - outflow60d,
    net_90d_cents: cumInflow90d - outflow90d,
    confidence_low_30d_cents: Math.max(0, confidenceLow30d),
    confidence_high_30d_cents: confidenceHigh30d,
    breakdown,
    model_version: 'v1',
    computed_at: now.toISOString(),
  }
}

// ─── Persist Projection ──────────────────────────────────────────────────────

export async function computeAndStoreCashFlow(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CashFlowProjection> {
  const projection = await projectCashFlow(supabase, orgId)

  const { data, error } = await supabase
    .from('cash_flow_projections')
    .upsert(projection, { onConflict: 'org_id,projection_date' })
    .select('*')
    .single()

  if (error) {
    logger.error('[cash-flow] Failed to store projection', { orgId, error: error.message })
    throw error
  }

  return data as CashFlowProjection
}
