/**
 * Collection Acceleration Engine
 *
 * Tracks payment patterns per client and triggers escalating
 * reminder sequences for overdue invoices.
 *
 * Reminder tiers:
 * - Gentle (3 days overdue): friendly payment reminder
 * - Firm (7 days overdue): formal payment notice
 * - Urgent (14 days overdue): escalation warning
 * - Final (30 days overdue): final notice before action
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueInsight } from './types'
import { dollarsToCents } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReminderTier = 'gentle' | 'firm' | 'urgent' | 'final'

export interface OverdueInvoice {
  id: string
  invoice_number: string
  client_contact_id: string | null
  client_name?: string
  total: number
  total_cents: number
  due_date: string
  days_overdue: number
  reminder_count: number
  recommended_tier: ReminderTier
  last_reminder_at?: string
}

export interface CollectionSummary {
  total_overdue_cents: number
  overdue_count: number
  by_tier: Record<ReminderTier, OverdueInvoice[]>
  avg_days_overdue: number
  worst_offenders: Array<{
    contact_id: string
    contact_name?: string
    overdue_count: number
    total_overdue_cents: number
    avg_days_overdue: number
  }>
}

export interface PaymentPattern {
  contact_id: string
  avg_days_to_pay: number
  on_time_rate: number
  total_invoices: number
  total_overdue: number
  typical_delay_days: number
}

// ─── Reminder Tier Logic ────────────────────────────────────────────────────

const TIER_THRESHOLDS: Array<{ minDays: number; tier: ReminderTier }> = [
  { minDays: 30, tier: 'final' },
  { minDays: 14, tier: 'urgent' },
  { minDays: 7, tier: 'firm' },
  { minDays: 3, tier: 'gentle' },
]

function getRecommendedTier(daysOverdue: number): ReminderTier {
  for (const { minDays, tier } of TIER_THRESHOLDS) {
    if (daysOverdue >= minDays) return tier
  }
  return 'gentle'
}

const TIER_MESSAGES: Record<ReminderTier, { subject: string; tone: string }> = {
  gentle: {
    subject: 'Friendly reminder: Invoice payment',
    tone: 'This is a friendly reminder that payment is due. If already sent, please disregard.',
  },
  firm: {
    subject: 'Payment overdue: Invoice reminder',
    tone: 'This is a formal notice that your invoice payment is now overdue. Please arrange payment at your earliest convenience.',
  },
  urgent: {
    subject: 'Urgent: Invoice payment required',
    tone: 'Your invoice is significantly overdue. Immediate payment is required to avoid disruption to services.',
  },
  final: {
    subject: 'Final notice: Invoice payment',
    tone: 'This is a final notice regarding your outstanding invoice. Please contact us immediately to arrange payment.',
  },
}

// ─── Detection ──────────────────────────────────────────────────────────────

/**
 * Find all overdue invoices and classify by reminder tier.
 */
export async function findOverdueInvoices(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OverdueInvoice[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)

    // Get overdue invoices (past due date, not paid/cancelled)
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_contact_id, total, due_date, reminder_count, status')
      .eq('org_id', orgId)
      .in('status', ['sent', 'viewed', 'overdue'])
      .lt('due_date', today)
      .order('due_date', { ascending: true })

    if (error) {
      logger.error('[collection-engine] Failed to find overdue invoices', { error: error.message })
      return []
    }

    if (!data || data.length === 0) return []

    // Get client names
    const contactIds = [...new Set(data.map(d => d.client_contact_id).filter(Boolean))] as string[]
    const contacts = new Map<string, string>()
    if (contactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds)

      for (const c of contactData ?? []) {
        contacts.set(c.id, c.name)
      }
    }

    return data.map(inv => {
      const daysOverdue = Math.round(
        (new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        client_contact_id: inv.client_contact_id,
        client_name: inv.client_contact_id ? contacts.get(inv.client_contact_id) : undefined,
        total: inv.total,
        total_cents: dollarsToCents(inv.total),
        due_date: inv.due_date,
        days_overdue: daysOverdue,
        reminder_count: inv.reminder_count,
        recommended_tier: getRecommendedTier(daysOverdue),
      }
    })
  } catch (err) {
    logger.error('[collection-engine] Error finding overdue invoices', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Build a collection summary with tier grouping and worst offenders.
 */
export async function getCollectionSummary(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CollectionSummary> {
  const overdueInvoices = await findOverdueInvoices(supabase, orgId)

  const byTier: Record<ReminderTier, OverdueInvoice[]> = {
    gentle: [],
    firm: [],
    urgent: [],
    final: [],
  }

  let totalOverdueCents = 0
  let totalDaysOverdue = 0
  const byContact = new Map<string, { overdue: number; cents: number; days: number; name?: string }>()

  for (const inv of overdueInvoices) {
    byTier[inv.recommended_tier].push(inv)
    totalOverdueCents += inv.total_cents
    totalDaysOverdue += inv.days_overdue

    if (inv.client_contact_id) {
      const existing = byContact.get(inv.client_contact_id) ?? { overdue: 0, cents: 0, days: 0 }
      existing.overdue++
      existing.cents += inv.total_cents
      existing.days += inv.days_overdue
      existing.name = inv.client_name
      byContact.set(inv.client_contact_id, existing)
    }
  }

  const worstOffenders = Array.from(byContact.entries())
    .map(([contactId, data]) => ({
      contact_id: contactId,
      contact_name: data.name,
      overdue_count: data.overdue,
      total_overdue_cents: data.cents,
      avg_days_overdue: Math.round(data.days / data.overdue),
    }))
    .sort((a, b) => b.total_overdue_cents - a.total_overdue_cents)
    .slice(0, 5)

  return {
    total_overdue_cents: totalOverdueCents,
    overdue_count: overdueInvoices.length,
    by_tier: byTier,
    avg_days_overdue: overdueInvoices.length > 0
      ? Math.round(totalDaysOverdue / overdueInvoices.length)
      : 0,
    worst_offenders: worstOffenders,
  }
}

/**
 * Analyze payment patterns for a specific client.
 */
export async function analyzePaymentPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<PaymentPattern | null> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('status, issued_date, due_date, paid_date')
      .eq('org_id', orgId)
      .eq('client_contact_id', contactId)
      .neq('status', 'cancelled')
      .neq('status', 'draft')

    if (error || !data || data.length === 0) return null

    const paidInvoices = data.filter(i => i.status === 'paid' && i.issued_date && i.paid_date)
    const overdueInvoices = data.filter(i => i.status === 'overdue')

    const paymentDays = paidInvoices.map(inv => {
      const issued = new Date(inv.issued_date!)
      const paid = new Date(inv.paid_date!)
      return Math.max(0, Math.round((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)))
    })

    const onTimeCount = paidInvoices.filter(inv => {
      if (!inv.due_date || !inv.paid_date) return false
      return new Date(inv.paid_date) <= new Date(inv.due_date)
    }).length

    return {
      contact_id: contactId,
      avg_days_to_pay: paymentDays.length > 0
        ? Math.round((paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length) * 10) / 10
        : 0,
      on_time_rate: paidInvoices.length > 0
        ? Math.round((onTimeCount / paidInvoices.length) * 100) / 100
        : 0,
      total_invoices: data.length,
      total_overdue: overdueInvoices.length,
      typical_delay_days: paymentDays.length > 0
        ? paymentDays.sort((a, b) => a - b)[Math.floor(paymentDays.length / 2)] // median
        : 0,
    }
  } catch (err) {
    logger.error('[collection-engine] Failed to analyze payment pattern', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Save overdue invoice insights for dashboard display.
 */
export async function saveCollectionInsights(
  supabase: SupabaseClient,
  orgId: string,
  overdueInvoices: OverdueInvoice[],
): Promise<number> {
  // Only create insights for invoices that warrant attention (7+ days overdue)
  const actionable = overdueInvoices.filter(inv => inv.days_overdue >= 7)
  if (actionable.length === 0) return 0

  // Expire old collection insights
  await supabase
    .from('revenue_insights')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('insight_type', 'overdue_invoice')
    .eq('status', 'active')

  const tierMessage = TIER_MESSAGES

  const insights: Array<Omit<RevenueInsight, 'id' | 'created_at' | 'updated_at'>> = actionable.map(inv => ({
    org_id: orgId,
    insight_type: 'overdue_invoice' as const,
    severity: inv.recommended_tier === 'final' ? 'critical' as const :
              inv.recommended_tier === 'urgent' ? 'high' as const :
              inv.recommended_tier === 'firm' ? 'medium' as const : 'low' as const,
    status: 'active' as const,
    title: `Overdue: ${inv.invoice_number} — $${inv.total.toFixed(2)} (${inv.days_overdue}d)`,
    description: `Invoice ${inv.invoice_number} to ${inv.client_name ?? 'Unknown'} is ${inv.days_overdue} days overdue. ${tierMessage[inv.recommended_tier].tone}`,
    recommended_action: `Send ${inv.recommended_tier} reminder. ${tierMessage[inv.recommended_tier].subject}`,
    amount_cents: inv.total_cents,
    confidence: 1.0,
    evidence: {
      invoice_number: inv.invoice_number,
      due_date: inv.due_date,
      days_overdue: inv.days_overdue,
      reminder_tier: inv.recommended_tier,
      reminder_count: inv.reminder_count,
    },
    contact_id: inv.client_contact_id,
    project_reference: null,
    invoice_id: inv.id,
    expires_at: null,
    actioned_at: null,
    actioned_by: null,
  }))

  const { error } = await supabase
    .from('revenue_insights')
    .insert(insights)

  if (error) {
    logger.error('[collection-engine] Failed to save insights', { error: error.message })
    return 0
  }

  return insights.length
}

/**
 * Run the full collection analysis pipeline.
 */
export async function runCollectionAnalysis(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ summary: CollectionSummary; insightsSaved: number }> {
  const overdueInvoices = await findOverdueInvoices(supabase, orgId)
  const summary = await getCollectionSummary(supabase, orgId)
  const insightsSaved = await saveCollectionInsights(supabase, orgId, overdueInvoices)

  return { summary, insightsSaved }
}
