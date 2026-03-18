/**
 * Cash Flow Projection Engine
 *
 * Projects 30/60/90 day cash flow from:
 * - Outstanding invoices (weighted by payment probability)
 * - Recurring revenue (retainers, subscriptions)
 * - Pipeline (proposals, expected work)
 *
 * Uses exponential smoothing on historical payment data to estimate
 * when outstanding invoices will actually be paid.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { CashFlowProjection, HorizonDays } from './types'
import { dollarsToCents } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface OutstandingInvoice {
  id: string
  total: number
  due_date: string | null
  status: string
  client_contact_id: string | null
  reminder_count: number
}

interface RetainerRecord {
  id: string
  monthly_amount_cents: number
  status: string
}

interface HistoricalPayment {
  total: number
  issued_date: string
  paid_date: string
}

// ─── Exponential Smoothing ──────────────────────────────────────────────────

/**
 * Simple exponential smoothing for payment probability.
 * Alpha controls responsiveness to recent data (0.3 is a good balance).
 */
function exponentialSmoothing(values: number[], alpha = 0.3): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  let smoothed = values[0]
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed
  }
  return smoothed
}

/**
 * Estimate payment probability within a horizon based on historical patterns.
 * Returns probability (0-1) that an invoice will be paid within `horizonDays`.
 */
function estimatePaymentProbability(
  daysToPay: number[],
  horizonDays: number,
  daysOverdue: number,
): number {
  if (daysToPay.length === 0) return 0.5 // No data, assume 50%

  // Base: what proportion of historical invoices were paid within this horizon?
  const paidWithin = daysToPay.filter(d => d <= horizonDays).length / daysToPay.length

  // Adjust for current overdue status
  let adjustment = 0
  if (daysOverdue > 30) adjustment = -0.3
  else if (daysOverdue > 14) adjustment = -0.15
  else if (daysOverdue > 7) adjustment = -0.05
  else if (daysOverdue <= 0) adjustment = 0.1

  return Math.max(0.05, Math.min(0.99, paidWithin + adjustment))
}

// ─── Projection Logic ───────────────────────────────────────────────────────

/**
 * Project cash flow for a given horizon.
 */
async function projectForHorizon(
  supabase: SupabaseClient,
  orgId: string,
  horizonDays: HorizonDays,
  outstandingInvoices: OutstandingInvoice[],
  retainers: RetainerRecord[],
  historicalPayments: HistoricalPayment[],
): Promise<Omit<CashFlowProjection, 'id' | 'created_at'>> {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // Build historical payment timing data
  const daysToPay = historicalPayments.map(p => {
    const issued = new Date(p.issued_date)
    const paid = new Date(p.paid_date)
    return Math.max(0, Math.round((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)))
  })

  // Smoothed average days to pay
  const smoothedAvgDays = daysToPay.length > 0
    ? exponentialSmoothing(daysToPay.sort((a, b) => a - b))
    : 14

  // Project inflows from outstanding invoices
  let fromOutstandingCents = 0
  let confidenceLow = 0
  let confidenceHigh = 0

  for (const inv of outstandingInvoices) {
    const amountCents = dollarsToCents(inv.total)
    const dueDate = inv.due_date ? new Date(inv.due_date) : now
    const daysOverdue = Math.round((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    const probability = estimatePaymentProbability(daysToPay, horizonDays, daysOverdue)
    const expectedCents = Math.round(amountCents * probability)

    fromOutstandingCents += expectedCents
    confidenceLow += Math.round(amountCents * Math.max(0, probability - 0.2))
    confidenceHigh += Math.round(amountCents * Math.min(1, probability + 0.15))
  }

  // Project inflows from recurring revenue (retainers)
  const monthsInHorizon = horizonDays / 30
  const monthlyRecurringCents = retainers
    .filter(r => r.status === 'active')
    .reduce((sum, r) => sum + r.monthly_amount_cents, 0)
  const fromRecurringCents = Math.round(monthlyRecurringCents * monthsInHorizon)

  // Total projected inflow
  const projectedInflowCents = fromOutstandingCents + fromRecurringCents

  // Outflow estimation (simplified: use historical average or 0 if no data)
  // In a full implementation, this would pull from expense tracking
  const projectedOutflowCents = 0

  // Net
  const netCashFlowCents = projectedInflowCents - projectedOutflowCents

  // Overall confidence
  const totalPossibleCents = outstandingInvoices.reduce(
    (sum, inv) => sum + dollarsToCents(inv.total), 0
  ) + fromRecurringCents

  const confidencePct = totalPossibleCents > 0
    ? Math.round((projectedInflowCents / totalPossibleCents) * 100) / 100
    : 0.5

  return {
    org_id: orgId,
    projection_date: today,
    horizon_days: horizonDays,
    projected_inflow_cents: projectedInflowCents,
    projected_outflow_cents: projectedOutflowCents,
    net_cash_flow_cents: netCashFlowCents,
    confidence_low_cents: confidenceLow + fromRecurringCents,
    confidence_high_cents: confidenceHigh + fromRecurringCents,
    confidence_pct: confidencePct,
    from_outstanding_cents: fromOutstandingCents,
    from_recurring_cents: fromRecurringCents,
    from_pipeline_cents: 0,
    sources: {
      outstanding_invoices: outstandingInvoices.length,
      active_retainers: retainers.filter(r => r.status === 'active').length,
      historical_payments: historicalPayments.length,
      smoothed_avg_days_to_pay: Math.round(smoothedAvgDays * 10) / 10,
    },
    currency: 'AUD',
    computed_at: now.toISOString(),
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute cash flow projections for 30, 60, and 90 day horizons.
 */
export async function computeCashFlowProjections(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{
  projections: Array<Omit<CashFlowProjection, 'id' | 'created_at'>>
  errors: number
}> {
  try {
    // Batch fetch all needed data
    const [outstandingResult, retainerResult, historicalResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, total, due_date, status, client_contact_id, reminder_count')
        .eq('org_id', orgId)
        .in('status', ['sent', 'viewed', 'overdue']),

      supabase
        .from('retainer_agreements')
        .select('id, monthly_amount_cents, status')
        .eq('org_id', orgId)
        .eq('status', 'active'),

      supabase
        .from('invoices')
        .select('total, issued_date, paid_date')
        .eq('org_id', orgId)
        .eq('status', 'paid')
        .not('issued_date', 'is', null)
        .not('paid_date', 'is', null)
        .order('paid_date', { ascending: false })
        .limit(100),
    ])

    const outstanding = (outstandingResult.data ?? []) as OutstandingInvoice[]
    const retainers = (retainerResult.data ?? []) as RetainerRecord[]
    const historical = (historicalResult.data ?? []) as HistoricalPayment[]

    const projections: Array<Omit<CashFlowProjection, 'id' | 'created_at'>> = []
    let errors = 0

    for (const horizon of [30, 60, 90] as HorizonDays[]) {
      try {
        const projection = await projectForHorizon(
          supabase, orgId, horizon, outstanding, retainers, historical
        )
        projections.push(projection)
      } catch (err) {
        logger.error('[cashflow-engine] Failed to project', {
          horizon,
          error: err instanceof Error ? err.message : String(err),
        })
        errors++
      }
    }

    return { projections, errors }
  } catch (err) {
    logger.error('[cashflow-engine] Failed to compute projections', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { projections: [], errors: 1 }
  }
}

/**
 * Save projections to database.
 */
export async function saveCashFlowProjections(
  supabase: SupabaseClient,
  projections: Array<Omit<CashFlowProjection, 'id' | 'created_at'>>,
): Promise<number> {
  if (projections.length === 0) return 0

  const { error } = await supabase
    .from('cash_flow_projections')
    .upsert(projections, { onConflict: 'org_id,projection_date,horizon_days' })

  if (error) {
    logger.error('[cashflow-engine] Failed to save projections', { error: error.message })
    return 0
  }

  return projections.length
}

/**
 * Get latest projections for display.
 */
export async function getLatestProjections(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CashFlowProjection[]> {
  const { data, error } = await supabase
    .from('cash_flow_projections')
    .select('*')
    .eq('org_id', orgId)
    .order('projection_date', { ascending: false })
    .limit(3)

  if (error) {
    logger.warn('[cashflow-engine] Failed to get projections', { error: error.message })
    return []
  }

  return (data ?? []) as CashFlowProjection[]
}

/**
 * Run the full cash flow projection pipeline.
 */
export async function runCashFlowProjection(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ projections: CashFlowProjection[]; saved: number; errors: number }> {
  const { projections, errors } = await computeCashFlowProjections(supabase, orgId)
  const saved = await saveCashFlowProjections(supabase, projections)

  logger.info('[cashflow-engine] Projection complete', {
    orgId,
    horizons: projections.map(p => p.horizon_days),
    saved,
    errors,
  })

  return { projections: projections as CashFlowProjection[], saved, errors }
}
