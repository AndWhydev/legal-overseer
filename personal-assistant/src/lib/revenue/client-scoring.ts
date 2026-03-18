/**
 * Client Revenue Scoring Engine
 *
 * Scores clients on weighted factors to produce a ranked list
 * with trend direction and risk flags.
 *
 * Scoring factors (weights):
 * - Invoice frequency (20%): How often the client generates invoices
 * - Payment speed (25%): How quickly invoices are paid
 * - Project value (25%): Average and total invoice value
 * - Consistency (15%): Regularity of revenue from this client
 * - Trend (15%): Direction of revenue over recent periods
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ClientRevenueScore, TrendDirection, RiskLevel } from './types'
import { dollarsToCents } from './types'

// ─── Scoring Weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  invoiceFrequency: 0.20,
  paymentSpeed: 0.25,
  projectValue: 0.25,
  consistency: 0.15,
  trend: 0.15,
} as const

// ─── Internal Types ─────────────────────────────────────────────────────────

interface InvoiceRecord {
  id: string
  total: number
  status: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  client_contact_id: string | null
  created_at: string
}

interface ScoreInput {
  contactId: string
  invoices: InvoiceRecord[]
  now: Date
}

// ─── Scoring Functions ──────────────────────────────────────────────────────

/**
 * Invoice frequency score (0-100).
 * Monthly invoicing = 100, quarterly = 60, yearly = 30, less = 10.
 */
function scoreInvoiceFrequency(invoices: InvoiceRecord[], monthsActive: number): number {
  if (invoices.length === 0 || monthsActive <= 0) return 0

  const invoicesPerMonth = invoices.length / Math.max(monthsActive, 1)

  if (invoicesPerMonth >= 1) return 100
  if (invoicesPerMonth >= 0.5) return 85
  if (invoicesPerMonth >= 0.25) return 60
  if (invoicesPerMonth >= 0.1) return 40
  return 15
}

/**
 * Payment speed score (0-100).
 * Pays on time = 100, within 7 days late = 70, 14 days = 40, more = 10.
 */
function scorePaymentSpeed(invoices: InvoiceRecord[]): { score: number; avgDays: number; onTimeRate: number } {
  const paidInvoices = invoices.filter(i => i.status === 'paid' && i.issued_date && i.paid_date)

  if (paidInvoices.length === 0) return { score: 50, avgDays: 0, onTimeRate: 0 }

  let totalDays = 0
  let onTimeCount = 0

  for (const inv of paidInvoices) {
    const issued = new Date(inv.issued_date!)
    const paid = new Date(inv.paid_date!)
    const due = inv.due_date ? new Date(inv.due_date) : new Date(issued.getTime() + 7 * 24 * 60 * 60 * 1000)

    const daysToPay = Math.max(0, Math.round((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)))
    totalDays += daysToPay

    if (paid <= due) onTimeCount++
  }

  const avgDays = totalDays / paidInvoices.length
  const onTimeRate = (onTimeCount / paidInvoices.length) * 100

  let score: number
  if (avgDays <= 7) score = 100
  else if (avgDays <= 14) score = 85
  else if (avgDays <= 21) score = 70
  else if (avgDays <= 30) score = 50
  else if (avgDays <= 45) score = 30
  else score = 10

  // Bonus/penalty for on-time rate
  if (onTimeRate >= 90) score = Math.min(100, score + 10)
  else if (onTimeRate < 50) score = Math.max(0, score - 15)

  return { score, avgDays: Math.round(avgDays * 10) / 10, onTimeRate: Math.round(onTimeRate * 100) / 100 }
}

/**
 * Project value score (0-100).
 * Based on average invoice size relative to org's typical invoices.
 * Higher value = higher score.
 */
function scoreProjectValue(invoices: InvoiceRecord[]): { score: number; avgCents: number; totalCents: number } {
  const activeInvoices = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
  if (activeInvoices.length === 0) return { score: 0, avgCents: 0, totalCents: 0 }

  const totalCents = activeInvoices.reduce((sum, inv) => sum + dollarsToCents(inv.total), 0)
  const avgCents = Math.round(totalCents / activeInvoices.length)

  // Score based on absolute value brackets (AUD)
  const avgDollars = avgCents / 100
  let score: number
  if (avgDollars >= 5000) score = 100
  else if (avgDollars >= 2000) score = 85
  else if (avgDollars >= 1000) score = 70
  else if (avgDollars >= 500) score = 55
  else if (avgDollars >= 200) score = 40
  else score = 20

  return { score, avgCents, totalCents }
}

/**
 * Consistency score (0-100).
 * Measures regularity of invoicing over active months.
 * High variance = low consistency.
 */
function scoreConsistency(invoices: InvoiceRecord[], now: Date): number {
  const activeInvoices = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
  if (activeInvoices.length < 2) return 50

  // Group invoices by month
  const monthCounts = new Map<string, number>()
  for (const inv of activeInvoices) {
    const date = inv.issued_date ?? inv.created_at
    const key = date.slice(0, 7) // YYYY-MM
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
  }

  if (monthCounts.size < 2) return 50

  // Calculate coefficient of variation (lower = more consistent)
  const counts = Array.from(monthCounts.values())
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

  // CV < 0.3 = very consistent (100), CV > 1.5 = very inconsistent (10)
  if (cv <= 0.3) return 100
  if (cv <= 0.5) return 80
  if (cv <= 0.8) return 60
  if (cv <= 1.0) return 40
  if (cv <= 1.5) return 20
  return 10
}

/**
 * Trend score (0-100) and direction.
 * Compares last 90 days revenue to prior 90 days.
 */
function scoreTrend(
  invoices: InvoiceRecord[],
  now: Date,
): { score: number; direction: TrendDirection; last90Cents: number; last30Cents: number } {
  const activeInvoices = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')
  if (activeInvoices.length === 0) return { score: 50, direction: 'new', last90Cents: 0, last30Cents: 0 }

  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const d180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)

  const revenueInRange = (start: Date, end: Date): number => {
    return activeInvoices
      .filter(inv => {
        const date = new Date(inv.issued_date ?? inv.created_at)
        return date >= start && date <= end
      })
      .reduce((sum, inv) => sum + dollarsToCents(inv.total), 0)
  }

  const last30Cents = revenueInRange(d30, now)
  const last90Cents = revenueInRange(d90, now)
  const prior90Cents = revenueInRange(d180, d90)

  // Determine trend
  let direction: TrendDirection
  let score: number

  if (activeInvoices.length <= 1) {
    direction = 'new'
    score = 50
  } else if (last90Cents === 0 && prior90Cents === 0) {
    direction = 'churned'
    score = 0
  } else if (last90Cents === 0 && prior90Cents > 0) {
    direction = 'churned'
    score = 5
  } else if (prior90Cents === 0) {
    direction = 'new'
    score = 70
  } else {
    const change = (last90Cents - prior90Cents) / prior90Cents
    if (change > 0.15) {
      direction = 'growing'
      score = Math.min(100, 70 + Math.round(change * 100))
    } else if (change < -0.15) {
      direction = 'declining'
      score = Math.max(10, 50 + Math.round(change * 100))
    } else {
      direction = 'stable'
      score = 60
    }
  }

  return { score, direction, last90Cents, last30Cents }
}

/**
 * Determine risk level from score components.
 */
function assessRisk(
  overallScore: number,
  trend: TrendDirection,
  overdueCount: number,
  invoiceCount: number,
): { level: RiskLevel; factors: string[] } {
  const factors: string[] = []

  if (trend === 'churned') factors.push('No recent invoices — possible churn')
  if (trend === 'declining') factors.push('Revenue declining over recent periods')
  if (overdueCount > 0) factors.push(`${overdueCount} overdue invoice(s)`)
  if (overdueCount > 0 && invoiceCount > 0 && overdueCount / invoiceCount > 0.3) {
    factors.push('High proportion of overdue invoices')
  }

  let level: RiskLevel
  if (factors.length >= 3 || trend === 'churned') level = 'critical'
  else if (factors.length >= 2 || overallScore < 30) level = 'high'
  else if (factors.length >= 1 || overallScore < 50) level = 'medium'
  else level = 'low'

  return { level, factors }
}

// ─── Main Scoring Function ──────────────────────────────────────────────────

/**
 * Compute a complete client revenue score.
 */
function computeClientScore(input: ScoreInput): Omit<ClientRevenueScore, 'id' | 'org_id' | 'created_at' | 'updated_at'> {
  const { contactId, invoices, now } = input
  const activeInvoices = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft')

  // Calculate months active
  const dates = activeInvoices.map(i => new Date(i.issued_date ?? i.created_at).getTime())
  const firstDate = dates.length > 0 ? Math.min(...dates) : now.getTime()
  const lastDate = dates.length > 0 ? Math.max(...dates) : now.getTime()
  const monthsActive = Math.max(1, (now.getTime() - firstDate) / (30 * 24 * 60 * 60 * 1000))

  // Compute individual scores
  const freqScore = scoreInvoiceFrequency(activeInvoices, monthsActive)
  const { score: speedScore, avgDays, onTimeRate } = scorePaymentSpeed(invoices)
  const { score: valueScore, avgCents, totalCents } = scoreProjectValue(invoices)
  const consistencyScore = scoreConsistency(invoices, now)
  const { score: trendScoreVal, direction, last90Cents, last30Cents } = scoreTrend(invoices, now)

  // Weighted overall score
  const overallScore = Math.round(
    freqScore * WEIGHTS.invoiceFrequency +
    speedScore * WEIGHTS.paymentSpeed +
    valueScore * WEIGHTS.projectValue +
    consistencyScore * WEIGHTS.consistency +
    trendScoreVal * WEIGHTS.trend
  )

  // Count overdue
  const overdueCount = invoices.filter(i => i.status === 'overdue').length
  const outstandingCents = invoices
    .filter(i => i.status === 'sent' || i.status === 'viewed' || i.status === 'overdue')
    .reduce((sum, inv) => sum + dollarsToCents(inv.total), 0)

  // Risk assessment
  const { level: riskLevel, factors: riskFactors } = assessRisk(
    overallScore, direction, overdueCount, activeInvoices.length
  )

  return {
    contact_id: contactId,
    overall_score: overallScore,
    invoice_frequency_score: freqScore,
    payment_speed_score: speedScore,
    project_value_score: valueScore,
    consistency_score: consistencyScore,
    trend_score: trendScoreVal,

    total_revenue_cents: totalCents,
    revenue_last_90d_cents: last90Cents,
    revenue_last_30d_cents: last30Cents,
    avg_invoice_cents: avgCents,
    total_outstanding_cents: outstandingCents,

    avg_days_to_pay: avgDays,
    on_time_rate_pct: onTimeRate,
    invoices_total: activeInvoices.length,
    invoices_paid: invoices.filter(i => i.status === 'paid').length,
    invoices_overdue: overdueCount,

    trend_direction: direction,
    risk_level: riskLevel,
    risk_factors: riskFactors,

    last_invoice_date: lastDate ? new Date(lastDate).toISOString().slice(0, 10) : null,
    first_invoice_date: firstDate ? new Date(firstDate).toISOString().slice(0, 10) : null,
    currency: 'AUD',
    computed_at: now.toISOString(),
  }
}

// ─── Database Operations ────────────────────────────────────────────────────

/**
 * Refresh client revenue scores for all clients in an org.
 * Batches all invoice queries into a single DB call.
 */
export async function refreshClientScores(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ scored: number; errors: number }> {
  const now = new Date()
  let scored = 0
  let errors = 0

  try {
    // Batch: fetch ALL invoices for org in one query
    const { data: allInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, total, status, issued_date, due_date, paid_date, client_contact_id, created_at')
      .eq('org_id', orgId)

    if (invError) {
      logger.error('[client-scoring] Failed to fetch invoices', { error: invError.message })
      return { scored: 0, errors: 1 }
    }

    const invoices = (allInvoices ?? []) as InvoiceRecord[]

    // Group by client
    const byClient = new Map<string, InvoiceRecord[]>()
    for (const inv of invoices) {
      if (!inv.client_contact_id) continue
      const existing = byClient.get(inv.client_contact_id) ?? []
      existing.push(inv)
      byClient.set(inv.client_contact_id, existing)
    }

    // Score each client
    const scores: Array<Omit<ClientRevenueScore, 'id' | 'created_at' | 'updated_at'>> = []

    for (const [contactId, clientInvoices] of byClient) {
      try {
        const score = computeClientScore({
          contactId,
          invoices: clientInvoices,
          now,
        })
        scores.push({ ...score, org_id: orgId })
        scored++
      } catch (err) {
        logger.warn('[client-scoring] Failed to score client', {
          contactId,
          error: err instanceof Error ? err.message : String(err),
        })
        errors++
      }
    }

    // Batch upsert all scores
    if (scores.length > 0) {
      const { error: upsertError } = await supabase
        .from('client_revenue_scores')
        .upsert(scores, { onConflict: 'org_id,contact_id' })

      if (upsertError) {
        logger.error('[client-scoring] Upsert failed', { error: upsertError.message })
        errors += scores.length
        scored = 0
      }
    }

    logger.info('[client-scoring] Refresh complete', { orgId, scored, errors })
  } catch (err) {
    logger.error('[client-scoring] Unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    })
    errors++
  }

  return { scored, errors }
}

/**
 * Get ranked client scores for an org.
 */
export async function getClientScores(
  supabase: SupabaseClient,
  orgId: string,
  options: { limit?: number; riskFilter?: RiskLevel[] } = {},
): Promise<ClientRevenueScore[]> {
  let query = supabase
    .from('client_revenue_scores')
    .select('*')
    .eq('org_id', orgId)

  if (options.riskFilter && options.riskFilter.length > 0) {
    query = query.in('risk_level', options.riskFilter)
  }

  query = query
    .order('overall_score', { ascending: false })
    .limit(options.limit ?? 50)

  const { data, error } = await query

  if (error) {
    logger.warn('[client-scoring] Failed to get scores', { error: error.message })
    return []
  }

  return (data ?? []) as ClientRevenueScore[]
}

/**
 * Get at-risk clients (high or critical risk).
 */
export async function getAtRiskClients(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ClientRevenueScore[]> {
  return getClientScores(supabase, orgId, { riskFilter: ['high', 'critical'] })
}
