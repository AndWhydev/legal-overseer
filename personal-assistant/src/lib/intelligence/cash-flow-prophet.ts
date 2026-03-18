import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CashFlowProjection {
  month: string // YYYY-MM
  projected_income: number
  projected_expenses: number
  net: number
  confidence: number // 0-1
  sources: ProjectionSource[]
}

export interface ProjectionSource {
  type: 'recurring' | 'pipeline' | 'historical' | 'overdue_expected'
  amount: number
  label: string
}

export interface CashFlowProphetResult {
  projections: CashFlowProjection[]
  currentMonth: {
    income: number
    expenses: number
    net: number
  }
  alerts: CashFlowProphetAlert[]
  gatheringData: boolean
  computedAt: string
}

export interface CashFlowProphetAlert {
  type: 'shortfall' | 'surplus' | 'declining_trend' | 'overdue_risk'
  month: string
  summary: string
  amount: number
  severity: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum paid invoices before projections are meaningful */
const MIN_PAID_INVOICES = 3

/** Cache metric type for bi_snapshots */
const CACHE_METRIC_TYPE = 'cash_flow_prophet'

/** Cache TTL: 12 hours (shorter -- cash flow is time-sensitive) */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** Shortfall threshold (projected negative net in a month) */
const SHORTFALL_THRESHOLD = -500

// ---------------------------------------------------------------------------
// Main: Project Cash Flow Forward
// ---------------------------------------------------------------------------

/**
 * Project cash flow forward N months from invoices, proposals, and recurring patterns.
 * Extends the Finance role's cash-flow-monitor with forward projections.
 * Caches in bi_snapshots with 12h TTL.
 */
export async function projectCashFlow(
  supabase: SupabaseClient,
  orgId: string,
  months: number = 3,
): Promise<CashFlowProphetResult> {
  const tag = `[cash-flow-prophet:${orgId.slice(0, 8)}]`

  // Check cache
  const cached = await getCachedResult(supabase, orgId)
  if (cached) {
    logger.info(`${tag} Returning cached cash flow projections`)
    return cached
  }

  const now = new Date()

  // Check minimum data threshold
  const { count: paidCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'paid')

  if ((paidCount ?? 0) < MIN_PAID_INVOICES) {
    const result: CashFlowProphetResult = {
      projections: [],
      currentMonth: { income: 0, expenses: 0, net: 0 },
      alerts: [],
      gatheringData: true,
      computedAt: now.toISOString(),
    }
    await cacheResult(supabase, orgId, result)
    logger.info(`${tag} Gathering data: only ${paidCount ?? 0} paid invoices (need ${MIN_PAID_INVOICES})`)
    return result
  }

  // -------------------------------------------------------------------------
  // 1. Current month actuals
  // -------------------------------------------------------------------------
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const { data: paidThisMonth } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', monthStart)
    .lte('paid_date', monthEnd)

  const currentIncome = (paidThisMonth ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // -------------------------------------------------------------------------
  // 2. Historical monthly income (last 6 months for pattern detection)
  // -------------------------------------------------------------------------
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)

  const { data: historicalInvoices } = await supabase
    .from('invoices')
    .select('total, paid_date, status')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', sixMonthsAgo)

  const monthlyIncome = computeMonthlyTotals(historicalInvoices ?? [])
  const avgMonthlyIncome = monthlyIncome.length > 0
    ? monthlyIncome.reduce((s, m) => s + m.total, 0) / monthlyIncome.length
    : 0

  // -------------------------------------------------------------------------
  // 3. Pipeline: sent invoices expected to be paid
  // -------------------------------------------------------------------------
  const { data: sentInvoices } = await supabase
    .from('invoices')
    .select('total, due_date, status')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])

  const pipelineByMonth: Record<string, number> = {}
  for (const inv of sentInvoices ?? []) {
    const dueDate = inv.due_date as string
    if (!dueDate) continue
    const monthKey = dueDate.slice(0, 7) // YYYY-MM
    pipelineByMonth[monthKey] = (pipelineByMonth[monthKey] ?? 0) + (Number(inv.total) || 0)
  }

  // -------------------------------------------------------------------------
  // 4. Overdue invoices expected to eventually be paid
  // -------------------------------------------------------------------------
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('total, due_date')
    .eq('org_id', orgId)
    .eq('status', 'overdue')

  const overdueTotal = (overdueInvoices ?? []).reduce(
    (sum, inv) => sum + (Number(inv.total) || 0),
    0,
  )

  // -------------------------------------------------------------------------
  // 5. Proposals (weighted by acceptance probability)
  // -------------------------------------------------------------------------
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, pricing')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])

  let proposalPipelineValue = 0
  for (const prop of proposals ?? []) {
    try {
      const pricing = typeof prop.pricing === 'string'
        ? JSON.parse(prop.pricing)
        : prop.pricing
      if (Array.isArray(pricing) && pricing.length > 0) {
        const standard = pricing.find((t: { tier: string }) =>
          t.tier?.toLowerCase().includes('standard'),
        )
        proposalPipelineValue += (standard?.price ?? pricing[0]?.price ?? 0) * 0.4 // 40% probability
      }
    } catch {
      // skip malformed
    }
  }

  // -------------------------------------------------------------------------
  // 6. Build projections for each future month
  // -------------------------------------------------------------------------
  const projections: CashFlowProjection[] = []
  const alerts: CashFlowProphetAlert[] = []

  for (let i = 1; i <= months; i++) {
    const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const monthKey = futureDate.toISOString().slice(0, 7)

    const sources: ProjectionSource[] = []

    // Historical baseline
    const historicalEstimate = avgMonthlyIncome
    if (historicalEstimate > 0) {
      sources.push({
        type: 'historical',
        amount: historicalEstimate,
        label: `Historical avg ($${historicalEstimate.toFixed(0)}/month)`,
      })
    }

    // Pipeline (sent invoices due in this month)
    const pipelineAmount = pipelineByMonth[monthKey] ?? 0
    if (pipelineAmount > 0) {
      sources.push({
        type: 'pipeline',
        amount: pipelineAmount,
        label: `Sent invoices due in ${monthKey}`,
      })
    }

    // Overdue expected recovery (spread over next 2 months)
    if (i <= 2 && overdueTotal > 0) {
      const overdueShare = overdueTotal * 0.5 / Math.min(2, months) // 50% recovery rate
      sources.push({
        type: 'overdue_expected',
        amount: overdueShare,
        label: `Expected overdue recovery`,
      })
    }

    // Proposal pipeline (spread evenly)
    if (proposalPipelineValue > 0) {
      const proposalShare = proposalPipelineValue / months
      sources.push({
        type: 'pipeline',
        amount: proposalShare,
        label: `Proposal pipeline (40% probability)`,
      })
    }

    // Use the better of: pipeline+proposals OR historical baseline
    const pipelineBased = sources
      .filter((s) => s.type !== 'historical')
      .reduce((sum, s) => sum + s.amount, 0)
    const projectedIncome = Math.max(pipelineBased, historicalEstimate)

    // Confidence decreases for further-out months
    const confidence = Math.max(0.2, 0.85 - (i - 1) * 0.2)

    const projection: CashFlowProjection = {
      month: monthKey,
      projected_income: Math.round(projectedIncome),
      projected_expenses: 0, // No expense tracking yet
      net: Math.round(projectedIncome),
      confidence,
      sources,
    }

    projections.push(projection)

    // --- Alerts ---
    if (projectedIncome < SHORTFALL_THRESHOLD * -1) {
      // Income below threshold
    }

    // Check for shortfall (when we eventually have expenses)
    if (projection.net < SHORTFALL_THRESHOLD) {
      alerts.push({
        type: 'shortfall',
        month: monthKey,
        summary: `Projected shortfall of $${Math.abs(projection.net).toFixed(0)} in ${monthKey}`,
        amount: Math.abs(projection.net),
        severity: 'high',
      })
    }
  }

  // Declining trend alert
  if (monthlyIncome.length >= 3) {
    const recentThree = monthlyIncome.slice(-3)
    const isDecreasing = recentThree.every(
      (m, i) => i === 0 || m.total <= recentThree[i - 1].total,
    )
    if (isDecreasing && recentThree[0].total > 0) {
      const declinePercent = Math.round(
        ((recentThree[0].total - recentThree[recentThree.length - 1].total) / recentThree[0].total) * 100,
      )
      if (declinePercent > 20) {
        alerts.push({
          type: 'declining_trend',
          month: now.toISOString().slice(0, 7),
          summary: `Revenue declining ${declinePercent}% over last 3 months ($${recentThree[0].total.toFixed(0)} -> $${recentThree[recentThree.length - 1].total.toFixed(0)})`,
          amount: recentThree[0].total - recentThree[recentThree.length - 1].total,
          severity: declinePercent > 50 ? 'high' : 'medium',
        })
      }
    }
  }

  // Overdue risk alert
  if (overdueTotal > 0) {
    alerts.push({
      type: 'overdue_risk',
      month: now.toISOString().slice(0, 7),
      summary: `$${overdueTotal.toFixed(0)} in overdue invoices at risk of non-payment`,
      amount: overdueTotal,
      severity: overdueTotal > 5000 ? 'high' : 'medium',
    })
  }

  const result: CashFlowProphetResult = {
    projections,
    currentMonth: {
      income: Math.round(currentIncome),
      expenses: 0,
      net: Math.round(currentIncome),
    },
    alerts,
    gatheringData: false,
    computedAt: now.toISOString(),
  }

  await cacheResult(supabase, orgId, result)

  logger.info(
    `${tag} Projected ${months} months: avg income $${avgMonthlyIncome.toFixed(0)}/mo, ` +
    `pipeline $${Object.values(pipelineByMonth).reduce((s, v) => s + v, 0).toFixed(0)}, ` +
    `overdue $${overdueTotal.toFixed(0)}, alerts=${alerts.length}`,
  )

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MonthTotal {
  month: string
  total: number
}

/** Group paid invoices by month and sum totals. */
function computeMonthlyTotals(
  invoices: Array<{ total: unknown; paid_date: unknown; status: unknown }>,
): MonthTotal[] {
  const byMonth: Record<string, number> = {}

  for (const inv of invoices) {
    const paidDate = inv.paid_date as string
    if (!paidDate) continue
    const monthKey = paidDate.slice(0, 7) // YYYY-MM
    byMonth[monthKey] = (byMonth[monthKey] ?? 0) + (Number(inv.total) || 0)
  }

  return Object.entries(byMonth)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ---------------------------------------------------------------------------
// Cache Helpers (bi_snapshots)
// ---------------------------------------------------------------------------

async function getCachedResult(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CashFlowProphetResult | null> {
  try {
    const { data } = await supabase
      .from('bi_snapshots')
      .select('data, expires_at')
      .eq('org_id', orgId)
      .eq('metric_type', CACHE_METRIC_TYPE)
      .single()

    if (!data) return null

    const expiresAt = new Date(data.expires_at as string)
    if (expiresAt <= new Date()) return null

    return data.data as CashFlowProphetResult
  } catch {
    return null
  }
}

async function cacheResult(
  supabase: SupabaseClient,
  orgId: string,
  result: CashFlowProphetResult,
): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString()

    await supabase.from('bi_snapshots').upsert(
      {
        org_id: orgId,
        metric_type: CACHE_METRIC_TYPE,
        data: result,
        computed_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'org_id,metric_type' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[cash-flow-prophet] Cache write failed: ${message}`)
  }
}
