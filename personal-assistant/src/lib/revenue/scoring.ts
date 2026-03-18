/**
 * Client Revenue Scoring Engine
 *
 * Computes a composite 0-100 score for each client based on:
 * - Invoice frequency (25% weight)
 * - Payment speed (25% weight)
 * - Project value (30% weight)
 * - Trend (20% weight)
 *
 * All monetary values in cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ClientRevenueScore, RevenueTrend } from './types'
import { dollarsToCents } from './types'

// ─── Scoring Weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  invoiceFrequency: 0.25,
  paymentSpeed: 0.25,
  projectValue: 0.30,
  trend: 0.20,
} as const

// ─── Scoring Functions ───────────────────────────────────────────────────────

/** Score invoice frequency: more invoices = higher score (capped) */
function scoreInvoiceFrequency(
  invoiceCount: number,
  monthsActive: number,
): number {
  if (invoiceCount === 0 || monthsActive <= 0) return 0
  const invoicesPerMonth = invoiceCount / monthsActive
  // 2+ invoices/month = perfect score
  return Math.min(100, Math.round(invoicesPerMonth * 50))
}

/** Score payment speed: faster payments = higher score */
function scorePaymentSpeed(
  avgDaysToPay: number | null,
  onTimeRate: number | null,
): number {
  if (avgDaysToPay === null) return 50 // default for no data
  // Perfect score at 0 days, drops to 0 at 60+ days
  const speedScore = Math.max(0, 100 - Math.round((avgDaysToPay / 60) * 100))
  // Blend with on-time rate if available
  if (onTimeRate !== null) {
    return Math.round(speedScore * 0.6 + onTimeRate * 100 * 0.4)
  }
  return speedScore
}

/** Score project value: higher total revenue = higher score */
function scoreProjectValue(
  totalRevenueCents: number,
  avgInvoiceCents: number,
): number {
  // Scale: $500 = 20, $2000 = 50, $10000 = 80, $20000+ = 100
  const totalDollars = totalRevenueCents / 100
  const score = Math.min(100, Math.round(Math.log10(Math.max(1, totalDollars)) * 30))
  // Boost for high average invoice value
  const avgDollars = avgInvoiceCents / 100
  const avgBonus = Math.min(20, Math.round(avgDollars / 100))
  return Math.min(100, score + avgBonus)
}

/** Score trend: growing clients score higher */
function scoreTrend(
  revenueMonths: Array<{ month: string; cents: number }>,
): { score: number; trend: RevenueTrend; growthRate: number | null } {
  if (revenueMonths.length < 2) {
    return { score: 50, trend: 'new', growthRate: null }
  }

  // Simple linear regression on monthly revenue
  const n = revenueMonths.length
  const xValues = Array.from({ length: n }, (_, i) => i)
  const yValues = revenueMonths.map(m => m.cents)

  const xMean = xValues.reduce((a, b) => a + b, 0) / n
  const yMean = yValues.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (yValues[i] - yMean)
    denominator += (xValues[i] - xMean) ** 2
  }

  const slope = denominator !== 0 ? numerator / denominator : 0
  const growthRate = yMean > 0 ? (slope / yMean) * 100 : 0

  // Determine trend
  let trend: RevenueTrend
  if (yValues[yValues.length - 1] === 0 && yValues[yValues.length - 2] === 0) {
    trend = 'churned'
  } else if (growthRate > 10) {
    trend = 'growing'
  } else if (growthRate < -10) {
    trend = 'declining'
  } else {
    trend = 'stable'
  }

  // Score: growing = 80-100, stable = 40-60, declining = 10-30, churned = 0
  const trendScores: Record<RevenueTrend, number> = {
    growing: Math.min(100, 80 + Math.round(growthRate / 5)),
    stable: 50,
    declining: Math.max(10, 30 + Math.round(growthRate / 2)),
    churned: 0,
    new: 50,
  }

  return {
    score: trendScores[trend],
    trend,
    growthRate: Math.round(growthRate * 10) / 10,
  }
}

// ─── Main Scoring Function ───────────────────────────────────────────────────

interface InvoiceRow {
  id: string
  total: number
  status: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  created_at: string
}

export async function scoreClient(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<Omit<ClientRevenueScore, 'id' | 'created_at' | 'updated_at'>> {
  const now = new Date()

  // Fetch all invoices for this client
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, total, status, issued_date, due_date, paid_date, created_at')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('[revenue-scoring] Failed to fetch invoices', { orgId, contactId, error: error.message })
    throw error
  }

  const rows = (invoices ?? []) as InvoiceRow[]

  if (rows.length === 0) {
    return {
      org_id: orgId,
      contact_id: contactId,
      invoice_frequency_score: 0,
      payment_speed_score: 0,
      project_value_score: 0,
      trend_score: 50,
      composite_score: 0,
      total_revenue_cents: 0,
      revenue_last_90d_cents: 0,
      revenue_last_365d_cents: 0,
      avg_invoice_cents: 0,
      avg_payment_days: null,
      invoice_count: 0,
      overdue_count: 0,
      trend: 'new',
      monthly_growth_rate: null,
      scored_at: now.toISOString(),
    }
  }

  // Calculate basic stats
  const paidInvoices = rows.filter(r => r.status === 'paid')
  const overdueInvoices = rows.filter(r => r.status === 'overdue')
  const totalRevenueCents = paidInvoices.reduce(
    (sum, r) => sum + dollarsToCents(parseFloat(String(r.total)) || 0),
    0,
  )

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  const revenueLast90dCents = paidInvoices
    .filter(r => r.paid_date && new Date(r.paid_date) >= ninetyDaysAgo)
    .reduce((sum, r) => sum + dollarsToCents(parseFloat(String(r.total)) || 0), 0)

  const revenueLast365dCents = paidInvoices
    .filter(r => r.paid_date && new Date(r.paid_date) >= yearAgo)
    .reduce((sum, r) => sum + dollarsToCents(parseFloat(String(r.total)) || 0), 0)

  const avgInvoiceCents = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + dollarsToCents(parseFloat(String(r.total)) || 0), 0) / rows.length)
    : 0

  // Payment speed
  const paymentDays: number[] = []
  for (const inv of paidInvoices) {
    if (inv.issued_date && inv.paid_date) {
      const issued = new Date(inv.issued_date)
      const paid = new Date(inv.paid_date)
      const days = Math.max(0, Math.floor((paid.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000)))
      paymentDays.push(days)
    }
  }

  const avgPaymentDays = paymentDays.length > 0
    ? Math.round((paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length) * 10) / 10
    : null

  const onTimePaid = paidInvoices.filter(inv => {
    if (!inv.due_date || !inv.paid_date) return false
    return new Date(inv.paid_date) <= new Date(inv.due_date)
  }).length
  const onTimeRate = paidInvoices.length > 0 ? onTimePaid / paidInvoices.length : null

  // Monthly revenue for trend analysis
  const firstInvoice = new Date(rows[0].created_at)
  const monthsActive = Math.max(
    1,
    Math.ceil((now.getTime() - firstInvoice.getTime()) / (30 * 24 * 60 * 60 * 1000)),
  )

  // Build monthly buckets
  const monthlyRevenue: Map<string, number> = new Map()
  for (const inv of paidInvoices) {
    const d = new Date(inv.paid_date ?? inv.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyRevenue.set(key, (monthlyRevenue.get(key) ?? 0) + dollarsToCents(parseFloat(String(inv.total)) || 0))
  }

  // Fill gaps with zeros for the last 12 months
  const revenueMonths: Array<{ month: string; cents: number }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    revenueMonths.push({ month: key, cents: monthlyRevenue.get(key) ?? 0 })
  }

  // Score each dimension
  const frequencyScore = scoreInvoiceFrequency(rows.length, monthsActive)
  const speedScore = scorePaymentSpeed(avgPaymentDays, onTimeRate)
  const valueScore = scoreProjectValue(totalRevenueCents, avgInvoiceCents)
  const { score: trendScoreValue, trend, growthRate } = scoreTrend(revenueMonths)

  // Weighted composite
  const composite = Math.round(
    frequencyScore * WEIGHTS.invoiceFrequency +
    speedScore * WEIGHTS.paymentSpeed +
    valueScore * WEIGHTS.projectValue +
    trendScoreValue * WEIGHTS.trend,
  )

  return {
    org_id: orgId,
    contact_id: contactId,
    invoice_frequency_score: frequencyScore,
    payment_speed_score: speedScore,
    project_value_score: valueScore,
    trend_score: trendScoreValue,
    composite_score: composite,
    total_revenue_cents: totalRevenueCents,
    revenue_last_90d_cents: revenueLast90dCents,
    revenue_last_365d_cents: revenueLast365dCents,
    avg_invoice_cents: avgInvoiceCents,
    avg_payment_days: avgPaymentDays,
    invoice_count: rows.length,
    overdue_count: overdueInvoices.length,
    trend,
    monthly_growth_rate: growthRate,
    scored_at: now.toISOString(),
  }
}

// ─── Batch Scoring ───────────────────────────────────────────────────────────

export async function scoreAllClients(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ scored: number; errors: number }> {
  // Find all contacts that have invoices
  const { data: contacts } = await supabase
    .from('invoices')
    .select('client_contact_id')
    .eq('org_id', orgId)
    .not('client_contact_id', 'is', null)

  if (!contacts || contacts.length === 0) return { scored: 0, errors: 0 }

  const uniqueContactIds = [...new Set(contacts.map(c => c.client_contact_id).filter(Boolean))]

  let scored = 0
  let errors = 0

  for (const contactId of uniqueContactIds) {
    try {
      const score = await scoreClient(supabase, orgId, contactId)

      const { error } = await supabase
        .from('client_revenue_scores')
        .upsert(
          { ...score, contact_id: contactId, org_id: orgId },
          { onConflict: 'org_id,contact_id' },
        )

      if (error) {
        logger.error('[revenue-scoring] Upsert failed', { contactId, error: error.message })
        errors++
      } else {
        scored++
      }
    } catch (err) {
      logger.error('[revenue-scoring] Score failed', {
        contactId,
        error: err instanceof Error ? err.message : String(err),
      })
      errors++
    }
  }

  return { scored, errors }
}
