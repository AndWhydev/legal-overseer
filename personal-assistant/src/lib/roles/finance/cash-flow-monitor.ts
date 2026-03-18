import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CashFlowSnapshot {
  period: 'current_month' | 'next_month' | 'next_quarter'
  incoming: number     // paid + expected from sent invoices
  outgoing: number     // known expenses (if tracked)
  pending: number      // sent but unpaid invoices
  overdue: number      // past due amount
  projectedBalance: number
  alerts: CashFlowAlert[]
}

export interface CashFlowAlert {
  type: 'shortfall_projected' | 'large_overdue' | 'payment_received' | 'unusual_delay'
  summary: string
  amount: number
  severity: 'high' | 'medium' | 'low'
}

interface InvoiceAggRow {
  status: string
  total_amount: number
  count: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold for "large overdue" alerts (AUD) */
const LARGE_OVERDUE_THRESHOLD = 5000

/** Threshold for "shortfall projected" alerts — negative projected balance */
const SHORTFALL_THRESHOLD = 0

/** Cache metric type for bi_snapshots */
const CACHE_METRIC_TYPE = 'cash_flow'

/** Cache TTL in hours */
const CACHE_TTL_HOURS = 24

// ---------------------------------------------------------------------------
// Main: Compute Cash Flow
// ---------------------------------------------------------------------------

/**
 * Compute cash flow snapshot for an org.
 *
 * Queries invoices by status, aggregates amounts, computes projections,
 * generates alerts, and caches in bi_snapshots with 24h expiry.
 *
 * Returns cached version if fresh (< 24h old).
 */
export async function computeCashFlow(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CashFlowSnapshot> {
  const tag = `[cash-flow:${orgId.slice(0, 8)}]`

  // 1. Check cache first
  const cached = await getCachedSnapshot(supabase, orgId)
  if (cached) {
    logger.info(`${tag} Returning cached cash flow snapshot`)
    return cached
  }

  // 2. Query invoices by status for current month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const alerts: CashFlowAlert[] = []

  // Paid invoices this month (incoming)
  const { data: paidInvoices, error: paidErr } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', monthStart)
    .lte('paid_date', monthEnd)

  if (paidErr) {
    logger.warn(`${tag} Error querying paid invoices: ${paidErr.message}`)
  }

  const paidTotal = (paidInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // Sent invoices (pending -- expected to be paid)
  const { data: sentInvoices, error: sentErr } = await supabase
    .from('invoices')
    .select('total, due_date')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])

  if (sentErr) {
    logger.warn(`${tag} Error querying sent invoices: ${sentErr.message}`)
  }

  const pendingTotal = (sentInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // Overdue invoices (past due)
  const today = now.toISOString().slice(0, 10)
  const { data: overdueInvoices, error: overdueErr } = await supabase
    .from('invoices')
    .select('total, invoice_number, client_contact_id, due_date')
    .eq('org_id', orgId)
    .eq('status', 'overdue')

  if (overdueErr) {
    logger.warn(`${tag} Error querying overdue invoices: ${overdueErr.message}`)
  }

  const overdueTotal = (overdueInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // Also count sent invoices that are past due but not yet marked overdue
  const sentPastDue = (sentInvoices ?? []).filter(
    (inv) => inv.due_date && (inv.due_date as string) < today,
  )
  const sentPastDueTotal = sentPastDue.reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  const totalOverdue = overdueTotal + sentPastDueTotal

  // Draft invoices (upcoming -- not yet sent)
  const { data: draftInvoices, error: draftErr } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .eq('status', 'draft')

  if (draftErr) {
    logger.warn(`${tag} Error querying draft invoices: ${draftErr.message}`)
  }

  const draftTotal = (draftInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // 3. Compute projections
  const incoming = paidTotal + pendingTotal
  const outgoing = 0 // No expense tracking yet
  const projectedBalance = incoming - outgoing

  // 4. Generate alerts
  if (totalOverdue >= LARGE_OVERDUE_THRESHOLD) {
    alerts.push({
      type: 'large_overdue',
      summary: `$${totalOverdue.toFixed(2)} in overdue invoices (${(overdueInvoices ?? []).length + sentPastDue.length} invoices)`,
      amount: totalOverdue,
      severity: 'high',
    })
  } else if (totalOverdue > 0) {
    alerts.push({
      type: 'large_overdue',
      summary: `$${totalOverdue.toFixed(2)} in overdue invoices`,
      amount: totalOverdue,
      severity: 'medium',
    })
  }

  if (projectedBalance < SHORTFALL_THRESHOLD) {
    alerts.push({
      type: 'shortfall_projected',
      summary: `Projected shortfall of $${Math.abs(projectedBalance).toFixed(2)} this month`,
      amount: Math.abs(projectedBalance),
      severity: 'high',
    })
  }

  // Flag individual large overdue invoices
  for (const inv of overdueInvoices ?? []) {
    const amount = Number(inv.total) || 0
    if (amount >= LARGE_OVERDUE_THRESHOLD) {
      alerts.push({
        type: 'large_overdue',
        summary: `Invoice ${inv.invoice_number} is overdue: $${amount.toFixed(2)}`,
        amount,
        severity: 'high',
      })
    }
  }

  const snapshot: CashFlowSnapshot = {
    period: 'current_month',
    incoming,
    outgoing,
    pending: pendingTotal,
    overdue: totalOverdue,
    projectedBalance,
    alerts,
  }

  // 5. Cache in bi_snapshots
  await cacheSnapshot(supabase, orgId, snapshot)

  logger.info(
    `${tag} Cash flow computed: incoming=$${incoming.toFixed(2)}, ` +
    `pending=$${pendingTotal.toFixed(2)}, overdue=$${totalOverdue.toFixed(2)}, ` +
    `projected=$${projectedBalance.toFixed(2)}, alerts=${alerts.length}`,
  )

  return snapshot
}

// ---------------------------------------------------------------------------
// Cache Helpers
// ---------------------------------------------------------------------------

/**
 * Get cached cash flow snapshot if it exists and hasn't expired.
 */
async function getCachedSnapshot(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CashFlowSnapshot | null> {
  const { data, error } = await supabase
    .from('bi_snapshots')
    .select('data, expires_at')
    .eq('org_id', orgId)
    .eq('metric_type', CACHE_METRIC_TYPE)
    .single()

  if (error || !data) return null

  // Check expiry
  const expiresAt = new Date(data.expires_at as string)
  if (expiresAt <= new Date()) return null

  return data.data as CashFlowSnapshot
}

/**
 * Cache cash flow snapshot in bi_snapshots with upsert (UNIQUE on org_id, metric_type).
 */
async function cacheSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  snapshot: CashFlowSnapshot,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('bi_snapshots')
    .upsert(
      {
        org_id: orgId,
        metric_type: CACHE_METRIC_TYPE,
        data: snapshot,
        computed_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'org_id,metric_type' },
    )

  if (error) {
    logger.warn(`[cash-flow] Failed to cache snapshot: ${error.message}`)
  }
}
