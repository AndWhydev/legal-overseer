/**
 * Retainer Monitoring
 *
<<<<<<< HEAD
 * Tracks recurring client relationships and detects:
 * - Forgotten renewals (regular invoicing gaps)
 * - Usage tracking (retainer vs actual hours)
 * - Renewal reminders for known retainer clients
 *
 * Works by analyzing invoice patterns to identify retainer-like relationships
 * (regular monthly/quarterly invoicing) and alerting when a pattern breaks.
=======
 * Tracks retainer agreements: renewal dates, usage vs allocation,
 * over/under utilization alerts. Flags forgotten renewals 30 days
 * before expiry.
>>>>>>> v1.5-marketing-launch
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
<<<<<<< HEAD
import { dollarsToCents } from './types'

interface RetainerClient {
  contactId: string
  contactName: string
  avgIntervalDays: number
  lastInvoiceDate: string
  daysSinceLastInvoice: number
  expectedNextDate: string
  isOverdue: boolean
  avgAmountCents: number
  invoiceCount: number
}

/**
 * Detect retainer-like patterns and identify overdue renewals.
 *
 * A "retainer" is identified as a client with 3+ invoices at a regular interval
 * (coefficient of variation of intervals < 0.4 = fairly regular).
 */
export async function detectRetainerRenewals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RetainerClient[]> {
  // Get all contacts with 3+ invoices
  const { data: contacts } = await supabase
    .from('invoices')
    .select('client_contact_id')
    .eq('org_id', orgId)
    .neq('status', 'cancelled')
    .not('client_contact_id', 'is', null)

  if (!contacts || contacts.length === 0) return []

  // Count invoices per contact
  const contactCounts: Record<string, number> = {}
  for (const c of contacts) {
    if (c.client_contact_id) {
      contactCounts[c.client_contact_id] = (contactCounts[c.client_contact_id] ?? 0) + 1
    }
  }

  // Filter to contacts with 3+ invoices (potential retainers)
  const retainerCandidates = Object.entries(contactCounts)
    .filter(([_, count]) => count >= 3)
    .map(([id]) => id)

  if (retainerCandidates.length === 0) return []

  // Fetch names
  const { data: contactData } = await supabase
    .from('contacts')
    .select('id, name')
    .in('id', retainerCandidates)

  const contactNames: Record<string, string> = {}
  for (const c of contactData ?? []) {
    contactNames[c.id] = c.name
  }

  const now = new Date()
  const results: RetainerClient[] = []

  for (const contactId of retainerCandidates) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('issued_date, total')
      .eq('org_id', orgId)
      .eq('client_contact_id', contactId)
      .neq('status', 'cancelled')
      .not('issued_date', 'is', null)
      .order('issued_date', { ascending: true })

    if (!invoices || invoices.length < 3) continue

    // Calculate intervals between consecutive invoices
    const dates = invoices.map(i => new Date(i.issued_date!))
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push(Math.round((dates[i].getTime() - dates[i - 1].getTime()) / (24 * 60 * 60 * 1000)))
    }

    // Check regularity: coefficient of variation < 0.4
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
    const stddev = Math.sqrt(variance)
    const cv = mean > 0 ? stddev / mean : 999

    if (cv > 0.4 || mean < 14) continue // too irregular or too frequent (likely project-based)

    const lastDate = dates[dates.length - 1]
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000))
    const expectedNext = new Date(lastDate.getTime() + mean * 24 * 60 * 60 * 1000)
    const isOverdue = now > expectedNext

    const avgAmount = invoices.reduce(
      (sum, i) => sum + dollarsToCents(parseFloat(String(i.total)) || 0),
      0,
    ) / invoices.length

    // Only flag if overdue by more than 25% of the interval
    if (isOverdue && daysSince > mean * 1.25) {
      results.push({
        contactId,
        contactName: contactNames[contactId] ?? 'Unknown',
        avgIntervalDays: Math.round(mean),
        lastInvoiceDate: lastDate.toISOString().slice(0, 10),
        daysSinceLastInvoice: daysSince,
        expectedNextDate: expectedNext.toISOString().slice(0, 10),
        isOverdue: true,
        avgAmountCents: Math.round(avgAmount),
        invoiceCount: invoices.length,
      })
    }
  }

  // Sort by overdue urgency (most overdue first)
  results.sort((a, b) => b.daysSinceLastInvoice - a.daysSinceLastInvoice)

  // Create insights for overdue retainers
  for (const retainer of results) {
    const overdueBy = retainer.daysSinceLastInvoice - retainer.avgIntervalDays

    await supabase.from('revenue_insights').upsert({
      org_id: orgId,
      insight_type: 'retainer_renewal',
      severity: overdueBy > 60 ? 'high' : 'medium',
      title: `${retainer.contactName} — retainer invoice overdue ${overdueBy} days`,
      description: `${retainer.contactName} is invoiced roughly every ${retainer.avgIntervalDays} days (${retainer.invoiceCount} invoices). Last invoice: ${retainer.lastInvoiceDate}. Expected next: ${retainer.expectedNextDate}. Average: $${(retainer.avgAmountCents / 100).toFixed(2)}.`,
      impact_cents: retainer.avgAmountCents,
      contact_id: retainer.contactId,
      suggested_action: `Generate invoice for ${retainer.contactName} (~$${(retainer.avgAmountCents / 100).toFixed(0)})`,
      action_payload: {
        contact_id: retainer.contactId,
        avg_amount_cents: retainer.avgAmountCents,
        avg_interval_days: retainer.avgIntervalDays,
      },
      status: 'active',
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'id' }).then(() => {})
  }

  logger.info('[retainer-monitor] Scan complete', {
    orgId,
    candidates: retainerCandidates.length,
    overdue: results.length,
  })

  return results
=======
import type { RetainerAgreement, RevenueInsight } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RetainerAlert {
  retainer_id: string
  contact_id: string
  contact_name?: string
  name: string
  alert_type: 'renewal' | 'underuse' | 'overuse'
  details: string
  amount_cents: number
}

// ─── Detection Logic ────────────────────────────────────────────────────────

/**
 * Check all active retainers for renewal dates and utilization issues.
 */
export async function checkRetainers(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    renewalWarningDays?: number
    underuseThresholdPct?: number
    overuseThresholdPct?: number
  } = {},
): Promise<RetainerAlert[]> {
  const {
    renewalWarningDays = 30,
    underuseThresholdPct = 50,
    overuseThresholdPct = 110,
  } = options

  try {
    const { data: retainers, error } = await supabase
      .from('retainer_agreements')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')

    if (error) {
      logger.error('[retainer-monitor] Failed to fetch retainers', { error: error.message })
      return []
    }

    if (!retainers || retainers.length === 0) return []

    // Get contact names
    const contactIds = retainers.map(r => r.contact_id)
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

    const now = new Date()
    const alerts: RetainerAlert[] = []

    for (const retainer of retainers as RetainerAgreement[]) {
      const contactName = contacts.get(retainer.contact_id)

      // Check renewal date
      if (retainer.renewal_date && !retainer.auto_renew) {
        const renewalDate = new Date(retainer.renewal_date)
        const daysUntilRenewal = Math.round(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysUntilRenewal <= renewalWarningDays && daysUntilRenewal >= 0) {
          alerts.push({
            retainer_id: retainer.id,
            contact_id: retainer.contact_id,
            contact_name: contactName,
            name: retainer.name,
            alert_type: 'renewal',
            details: `Retainer "${retainer.name}" for ${contactName ?? 'Unknown'} renews in ${daysUntilRenewal} day(s) on ${retainer.renewal_date}. Not set to auto-renew.`,
            amount_cents: retainer.monthly_amount_cents,
          })
        }
      }

      // Check utilization (if hours are allocated)
      if (retainer.hours_allocated > 0) {
        const utilizationPct = (retainer.current_month_hours / retainer.hours_allocated) * 100

        // Check day of month to see if underuse alert makes sense
        const dayOfMonth = now.getDate()
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        const expectedUtilizationPct = (dayOfMonth / daysInMonth) * 100

        // Underuse: below threshold AND past mid-month
        if (utilizationPct < underuseThresholdPct && dayOfMonth > 15 && utilizationPct < expectedUtilizationPct * 0.5) {
          alerts.push({
            retainer_id: retainer.id,
            contact_id: retainer.contact_id,
            contact_name: contactName,
            name: retainer.name,
            alert_type: 'underuse',
            details: `Retainer "${retainer.name}" for ${contactName ?? 'Unknown'}: only ${retainer.current_month_hours}h of ${retainer.hours_allocated}h used (${Math.round(utilizationPct)}%). ${retainer.hours_allocated - retainer.current_month_hours}h remaining this month.`,
            amount_cents: retainer.monthly_amount_cents,
          })
        }

        // Overuse: exceeding allocation
        if (utilizationPct >= overuseThresholdPct) {
          const overHours = retainer.current_month_hours - retainer.hours_allocated
          alerts.push({
            retainer_id: retainer.id,
            contact_id: retainer.contact_id,
            contact_name: contactName,
            name: retainer.name,
            alert_type: 'overuse',
            details: `Retainer "${retainer.name}" for ${contactName ?? 'Unknown'}: ${retainer.current_month_hours}h used of ${retainer.hours_allocated}h allocated (${Math.round(utilizationPct)}%). ${overHours.toFixed(1)}h over allocation.`,
            amount_cents: retainer.monthly_amount_cents,
          })
        }
      }
    }

    logger.info('[retainer-monitor] Check complete', { orgId, alerts: alerts.length })
    return alerts
  } catch (err) {
    logger.error('[retainer-monitor] Check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Save retainer alerts as revenue insights.
 */
export async function saveRetainerInsights(
  supabase: SupabaseClient,
  orgId: string,
  alerts: RetainerAlert[],
): Promise<number> {
  if (alerts.length === 0) return 0

  const typeMap: Record<string, RevenueInsight['insight_type']> = {
    renewal: 'retainer_renewal',
    underuse: 'retainer_underuse',
    overuse: 'retainer_overuse',
  }

  // Expire old retainer insights
  await supabase
    .from('revenue_insights')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .in('insight_type', ['retainer_renewal', 'retainer_underuse', 'retainer_overuse'])
    .eq('status', 'active')

  const insights: Array<Omit<RevenueInsight, 'id' | 'created_at' | 'updated_at'>> = alerts.map(a => ({
    org_id: orgId,
    insight_type: typeMap[a.alert_type] ?? 'retainer_renewal',
    severity: a.alert_type === 'overuse' ? 'high' as const :
              a.alert_type === 'renewal' ? 'medium' as const : 'low' as const,
    status: 'active' as const,
    title: a.alert_type === 'renewal'
      ? `Retainer renewal: ${a.name}`
      : a.alert_type === 'overuse'
        ? `Retainer overuse: ${a.name}`
        : `Retainer underuse: ${a.name}`,
    description: a.details,
    recommended_action: a.alert_type === 'renewal'
      ? 'Review and renew retainer agreement before expiry.'
      : a.alert_type === 'overuse'
        ? 'Invoice for additional hours or adjust retainer allocation.'
        : 'Reach out to client about utilizing remaining retainer hours.',
    amount_cents: a.amount_cents,
    confidence: 0.95,
    evidence: {
      retainer_id: a.retainer_id,
      alert_type: a.alert_type,
    },
    contact_id: a.contact_id,
    project_reference: null,
    invoice_id: null,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    actioned_at: null,
    actioned_by: null,
  }))

  const { error } = await supabase
    .from('revenue_insights')
    .insert(insights)

  if (error) {
    logger.error('[retainer-monitor] Failed to save insights', { error: error.message })
    return 0
  }

  return insights.length
}

/**
 * Run full retainer monitoring pipeline.
 */
export async function runRetainerMonitoring(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ alerts: RetainerAlert[]; saved: number }> {
  const alerts = await checkRetainers(supabase, orgId)
  const saved = await saveRetainerInsights(supabase, orgId, alerts)
  return { alerts, saved }
>>>>>>> v1.5-marketing-launch
}
