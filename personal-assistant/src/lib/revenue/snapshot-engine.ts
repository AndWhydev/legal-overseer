/**
 * Revenue Snapshot Engine
 *
 * Computes periodic revenue snapshots from the invoices table.
 * Designed for batch execution via cron — no LLM calls needed.
 *
 * Pattern: batch all invoice analysis in a single query rather than
 * analyzing each invoice individually (95% cost reduction from batching).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueSnapshot, PeriodType } from './types'
import { dollarsToCents } from './types'

interface InvoiceRow {
  id: string
  status: string
  total: number
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  client_contact_id: string | null
  created_at: string
}

interface SnapshotInput {
  orgId: string
  periodStart: Date
  periodEnd: Date
  periodType: PeriodType
}

/**
 * Compute a revenue snapshot for a given period.
 * Batches all invoice queries into minimal DB calls.
 */
export async function computeSnapshot(
  supabase: SupabaseClient,
  input: SnapshotInput,
): Promise<Omit<RevenueSnapshot, 'id' | 'created_at'> | null> {
  const { orgId, periodStart, periodEnd, periodType } = input
  const startStr = periodStart.toISOString().slice(0, 10)
  const endStr = periodEnd.toISOString().slice(0, 10)

  try {
    // Batch query: all invoices in period + all outstanding
    const [periodResult, outstandingResult, overdueResult] = await Promise.all([
      // Invoices created/issued in this period
      supabase
        .from('invoices')
        .select('id, status, total, issued_date, due_date, paid_date, client_contact_id, created_at')
        .eq('org_id', orgId)
        .gte('created_at', periodStart.toISOString())
        .lte('created_at', periodEnd.toISOString()),

      // All outstanding invoices (sent or viewed, not yet paid)
      supabase
        .from('invoices')
        .select('id, total, due_date')
        .eq('org_id', orgId)
        .in('status', ['sent', 'viewed']),

      // All overdue invoices
      supabase
        .from('invoices')
        .select('id, total, due_date')
        .eq('org_id', orgId)
        .eq('status', 'overdue'),
    ])

    const periodInvoices = (periodResult.data ?? []) as InvoiceRow[]
    const outstandingInvoices = outstandingResult.data ?? []
    const overdueInvoices = overdueResult.data ?? []

    // Compute aggregates from period invoices
    let totalInvoicedCents = 0
    let totalCollectedCents = 0
    let totalCancelledCents = 0
    let invoicesSent = 0
    let invoicesPaid = 0
    const clientIds = new Set<string>()
    const paymentDays: number[] = []

    for (const inv of periodInvoices) {
      const amountCents = dollarsToCents(inv.total)

      if (inv.status !== 'cancelled' && inv.status !== 'draft') {
        totalInvoicedCents += amountCents
        invoicesSent++
      }

      if (inv.status === 'paid') {
        totalCollectedCents += amountCents
        invoicesPaid++

        // Calculate days to pay
        if (inv.issued_date && inv.paid_date) {
          const issued = new Date(inv.issued_date)
          const paid = new Date(inv.paid_date)
          const days = Math.round((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24))
          if (days >= 0) paymentDays.push(days)
        }
      }

      if (inv.status === 'cancelled') {
        totalCancelledCents += amountCents
      }

      if (inv.client_contact_id) {
        clientIds.add(inv.client_contact_id)
      }
    }

    // Outstanding and overdue from current state (not period-filtered)
    const totalOutstandingCents = outstandingInvoices.reduce(
      (sum, inv) => sum + dollarsToCents(inv.total ?? 0), 0
    )
    const totalOverdueCents = overdueInvoices.reduce(
      (sum, inv) => sum + dollarsToCents(inv.total ?? 0), 0
    )

    // Derived metrics
    const collectionRate = totalInvoicedCents > 0
      ? (totalCollectedCents / totalInvoicedCents) * 100
      : 0

    const avgDaysToPay = paymentDays.length > 0
      ? paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length
      : 0

    // Count new clients (first invoice in this period)
    let newClients = 0
    if (clientIds.size > 0) {
      const { count } = await supabase
        .from('invoices')
        .select('client_contact_id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('client_contact_id', Array.from(clientIds))
        .lt('created_at', periodStart.toISOString())

      newClients = clientIds.size - (count ?? 0)
    }

    return {
      org_id: orgId,
      period_start: startStr,
      period_end: endStr,
      period_type: periodType,
      total_invoiced_cents: totalInvoicedCents,
      total_collected_cents: totalCollectedCents,
      total_outstanding_cents: totalOutstandingCents,
      total_overdue_cents: totalOverdueCents,
      total_cancelled_cents: totalCancelledCents,
      invoices_sent: invoicesSent,
      invoices_paid: invoicesPaid,
      invoices_overdue: overdueInvoices.length,
      new_clients: newClients,
      collection_rate_pct: Math.round(collectionRate * 100) / 100,
      avg_days_to_pay: Math.round(avgDaysToPay * 10) / 10,
      currency: 'AUD',
      computed_at: new Date().toISOString(),
    }
  } catch (err) {
    logger.error('[snapshot-engine] Failed to compute snapshot', {
      orgId,
      periodType,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Upsert a snapshot into the database.
 */
export async function saveSnapshot(
  supabase: SupabaseClient,
  snapshot: Omit<RevenueSnapshot, 'id' | 'created_at'>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('revenue_snapshots')
    .upsert(snapshot, {
      onConflict: 'org_id,period_start,period_end,period_type',
    })
    .select('id')
    .single()

  if (error) {
    logger.error('[snapshot-engine] Failed to save snapshot', { error: error.message })
    return null
  }

  return data?.id ?? null
}

/**
 * Compute and save snapshots for current month, quarter, and year.
 * Designed to run from cron.
 */
export async function refreshSnapshots(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ saved: number; errors: number }> {
  const now = new Date()
  let saved = 0
  let errors = 0

  // Monthly snapshot: current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const monthly = await computeSnapshot(supabase, {
    orgId,
    periodStart: monthStart,
    periodEnd: monthEnd,
    periodType: 'monthly',
  })

  if (monthly) {
    const id = await saveSnapshot(supabase, monthly)
    if (id) saved++
    else errors++
  } else {
    errors++
  }

  // Quarterly snapshot
  const quarter = Math.floor(now.getMonth() / 3)
  const qStart = new Date(now.getFullYear(), quarter * 3, 1)
  const qEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0)

  const quarterly = await computeSnapshot(supabase, {
    orgId,
    periodStart: qStart,
    periodEnd: qEnd,
    periodType: 'quarterly',
  })

  if (quarterly) {
    const id = await saveSnapshot(supabase, quarterly)
    if (id) saved++
    else errors++
  } else {
    errors++
  }

  // Yearly snapshot
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear(), 11, 31)

  const yearly = await computeSnapshot(supabase, {
    orgId,
    periodStart: yearStart,
    periodEnd: yearEnd,
    periodType: 'yearly',
  })

  if (yearly) {
    const id = await saveSnapshot(supabase, yearly)
    if (id) saved++
    else errors++
  } else {
    errors++
  }

  logger.info('[snapshot-engine] Refresh complete', { orgId, saved, errors })
  return { saved, errors }
}

/**
 * Get the latest snapshot for an org by period type.
 */
export async function getLatestSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  periodType: PeriodType = 'monthly',
): Promise<RevenueSnapshot | null> {
  const { data, error } = await supabase
    .from('revenue_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_type', periodType)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('[snapshot-engine] Failed to get latest snapshot', { error: error.message })
    return null
  }

  return data as RevenueSnapshot | null
}

/**
 * Get snapshot history for charting.
 */
export async function getSnapshotHistory(
  supabase: SupabaseClient,
  orgId: string,
  periodType: PeriodType = 'monthly',
  limit = 12,
): Promise<RevenueSnapshot[]> {
  const { data, error } = await supabase
    .from('revenue_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_type', periodType)
    .order('period_start', { ascending: false })
    .limit(limit)

  if (error) {
    logger.warn('[snapshot-engine] Failed to get snapshot history', { error: error.message })
    return []
  }

  return (data ?? []) as RevenueSnapshot[]
}
