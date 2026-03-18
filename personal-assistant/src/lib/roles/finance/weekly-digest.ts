import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyFinanceDigest {
  period: { start: string; end: string }
  invoiced: { count: number; total: number }
  received: { count: number; total: number }
  overdue: { count: number; total: number }
  upcoming: { count: number; total: number }  // due in next 7 days
  cashFlowSummary: string
  insights: string[]
  actionItems: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AEST offset (UTC+10) for Monday morning detection */
const AEST_OFFSET_HOURS = 10

/** Cache metric type for bi_snapshots */
const DIGEST_METRIC_TYPE = 'weekly_finance_digest'

// ---------------------------------------------------------------------------
// Main: Generate Weekly Digest
// ---------------------------------------------------------------------------

/**
 * Generate a weekly financial digest summarizing the past 7 days.
 *
 * Includes:
 * - Invoices created (drafted/sent) this week
 * - Payments received this week
 * - Currently overdue invoices
 * - Invoices due in the next 7 days
 * - Cash flow summary text
 * - AI-generated insights and action items
 *
 * Only generated on Monday ticks (checked in AEST timezone).
 * Cached in bi_snapshots to avoid recomputation within the week.
 */
export async function generateWeeklyDigest(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WeeklyFinanceDigest> {
  const tag = `[weekly-digest:${orgId.slice(0, 8)}]`

  // Calculate period (last 7 days)
  const now = new Date()
  const weekEnd = now.toISOString().slice(0, 10)
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // 1. Invoices created this week
  const { data: createdInvoices, error: createdErr } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd + 'T23:59:59Z')

  if (createdErr) {
    logger.warn(`${tag} Error querying created invoices: ${createdErr.message}`)
  }

  const invoicedCount = (createdInvoices ?? []).length
  const invoicedTotal = (createdInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // 2. Payments received this week
  const { data: paidInvoices, error: paidErr } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', weekStart)
    .lte('paid_date', weekEnd)

  if (paidErr) {
    logger.warn(`${tag} Error querying paid invoices: ${paidErr.message}`)
  }

  const receivedCount = (paidInvoices ?? []).length
  const receivedTotal = (paidInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // 3. Currently overdue invoices
  const today = now.toISOString().slice(0, 10)
  const { data: overdueInvoices, error: overdueErr } = await supabase
    .from('invoices')
    .select('total, invoice_number, client_contact_id, due_date')
    .eq('org_id', orgId)
    .eq('status', 'overdue')

  if (overdueErr) {
    logger.warn(`${tag} Error querying overdue invoices: ${overdueErr.message}`)
  }

  // Also include sent invoices past due
  const { data: sentPastDue, error: sentPastErr } = await supabase
    .from('invoices')
    .select('total, invoice_number')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])
    .lt('due_date', today)

  if (sentPastErr) {
    logger.warn(`${tag} Error querying sent past-due invoices: ${sentPastErr.message}`)
  }

  const allOverdue = [...(overdueInvoices ?? []), ...(sentPastDue ?? [])]
  const overdueCount = allOverdue.length
  const overdueTotal = allOverdue.reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // 4. Upcoming -- due in next 7 days
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: upcomingInvoices, error: upcomingErr } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])
    .gte('due_date', today)
    .lte('due_date', nextWeek)

  if (upcomingErr) {
    logger.warn(`${tag} Error querying upcoming invoices: ${upcomingErr.message}`)
  }

  const upcomingCount = (upcomingInvoices ?? []).length
  const upcomingTotal = (upcomingInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // 5. Generate insights
  const insights = generateInsights({
    invoicedCount,
    invoicedTotal,
    receivedCount,
    receivedTotal,
    overdueCount,
    overdueTotal,
    upcomingCount,
    upcomingTotal,
  })

  // 6. Generate action items
  const actionItems = generateActionItems({
    overdueCount,
    overdueTotal,
    upcomingCount,
    upcomingTotal,
    overdueInvoices: overdueInvoices ?? [],
  })

  // 7. Build cash flow summary
  const cashFlowSummary = buildCashFlowSummary({
    receivedTotal,
    upcomingTotal,
    overdueTotal,
  })

  const digest: WeeklyFinanceDigest = {
    period: { start: weekStart, end: weekEnd },
    invoiced: { count: invoicedCount, total: invoicedTotal },
    received: { count: receivedCount, total: receivedTotal },
    overdue: { count: overdueCount, total: overdueTotal },
    upcoming: { count: upcomingCount, total: upcomingTotal },
    cashFlowSummary,
    insights,
    actionItems,
  }

  // 8. Cache in bi_snapshots
  await cacheDigest(supabase, orgId, digest)

  logger.info(
    `${tag} Weekly digest generated: ` +
    `invoiced=${invoicedCount}/$${invoicedTotal.toFixed(2)}, ` +
    `received=${receivedCount}/$${receivedTotal.toFixed(2)}, ` +
    `overdue=${overdueCount}/$${overdueTotal.toFixed(2)}, ` +
    `upcoming=${upcomingCount}/$${upcomingTotal.toFixed(2)}`,
  )

  return digest
}

// ---------------------------------------------------------------------------
// Monday Check (AEST)
// ---------------------------------------------------------------------------

/**
 * Check if it's Monday in AEST timezone.
 * Used by the finance role to determine when to generate the weekly digest.
 */
export function isMondayInAEST(date?: Date): boolean {
  const d = date ?? new Date()
  // Convert to AEST by adding offset
  const aestMs = d.getTime() + AEST_OFFSET_HOURS * 60 * 60 * 1000
  const aestDate = new Date(aestMs)
  // getUTCDay() on the shifted date gives us the AEST day of week
  return aestDate.getUTCDay() === 1 // Monday
}

// ---------------------------------------------------------------------------
// Insight Generation
// ---------------------------------------------------------------------------

interface DigestStats {
  invoicedCount: number
  invoicedTotal: number
  receivedCount: number
  receivedTotal: number
  overdueCount: number
  overdueTotal: number
  upcomingCount: number
  upcomingTotal: number
}

function generateInsights(stats: DigestStats): string[] {
  const insights: string[] = []

  if (stats.receivedTotal > 0) {
    insights.push(
      `Received $${stats.receivedTotal.toFixed(2)} from ${stats.receivedCount} payment${stats.receivedCount > 1 ? 's' : ''} this week.`,
    )
  } else {
    insights.push('No payments received this week.')
  }

  if (stats.invoicedTotal > 0) {
    insights.push(
      `Created ${stats.invoicedCount} new invoice${stats.invoicedCount > 1 ? 's' : ''} totalling $${stats.invoicedTotal.toFixed(2)}.`,
    )
  }

  if (stats.overdueCount > 0) {
    const avgOverdue = stats.overdueTotal / stats.overdueCount
    insights.push(
      `${stats.overdueCount} invoice${stats.overdueCount > 1 ? 's' : ''} overdue, averaging $${avgOverdue.toFixed(2)} each.`,
    )
  }

  if (stats.upcomingCount > 0) {
    insights.push(
      `$${stats.upcomingTotal.toFixed(2)} expected from ${stats.upcomingCount} invoice${stats.upcomingCount > 1 ? 's' : ''} due this week.`,
    )
  }

  // Net position insight
  const netInflow = stats.receivedTotal - stats.invoicedTotal
  if (netInflow > 0) {
    insights.push(`Net positive cash flow: +$${netInflow.toFixed(2)} this week.`)
  } else if (netInflow < 0) {
    insights.push(`More invoiced than received: -$${Math.abs(netInflow).toFixed(2)} net this week.`)
  }

  return insights
}

// ---------------------------------------------------------------------------
// Action Item Generation
// ---------------------------------------------------------------------------

function generateActionItems(params: {
  overdueCount: number
  overdueTotal: number
  upcomingCount: number
  upcomingTotal: number
  overdueInvoices: Array<Record<string, unknown>>
}): string[] {
  const items: string[] = []

  if (params.overdueCount > 0) {
    items.push(
      `Follow up on ${params.overdueCount} overdue invoice${params.overdueCount > 1 ? 's' : ''} ($${params.overdueTotal.toFixed(2)} outstanding).`,
    )
  }

  if (params.upcomingCount > 0) {
    items.push(
      `${params.upcomingCount} invoice${params.upcomingCount > 1 ? 's' : ''} due this week ($${params.upcomingTotal.toFixed(2)}) -- monitor for timely payment.`,
    )
  }

  // Specific overdue invoice action items (top 3 by amount)
  const sortedOverdue = [...params.overdueInvoices]
    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
    .slice(0, 3)

  for (const inv of sortedOverdue) {
    const amount = Number(inv.total) || 0
    if (amount > 0) {
      items.push(
        `Chase payment for invoice ${inv.invoice_number} ($${amount.toFixed(2)}).`,
      )
    }
  }

  if (items.length === 0) {
    items.push('All invoices are current. No urgent financial actions needed.')
  }

  return items
}

// ---------------------------------------------------------------------------
// Cash Flow Summary
// ---------------------------------------------------------------------------

function buildCashFlowSummary(params: {
  receivedTotal: number
  upcomingTotal: number
  overdueTotal: number
}): string {
  const parts: string[] = []

  if (params.receivedTotal > 0) {
    parts.push(`$${params.receivedTotal.toFixed(2)} received`)
  }
  if (params.upcomingTotal > 0) {
    parts.push(`$${params.upcomingTotal.toFixed(2)} expected this week`)
  }
  if (params.overdueTotal > 0) {
    parts.push(`$${params.overdueTotal.toFixed(2)} overdue`)
  }

  if (parts.length === 0) {
    return 'No significant cash flow activity this week.'
  }

  return parts.join(', ') + '.'
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function cacheDigest(
  supabase: SupabaseClient,
  orgId: string,
  digest: WeeklyFinanceDigest,
): Promise<void> {
  // Cache for 7 days (until next digest)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('bi_snapshots')
    .upsert(
      {
        org_id: orgId,
        metric_type: DIGEST_METRIC_TYPE,
        data: digest,
        computed_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'org_id,metric_type' },
    )

  if (error) {
    logger.warn(`[weekly-digest] Failed to cache digest: ${error.message}`)
  }
}
