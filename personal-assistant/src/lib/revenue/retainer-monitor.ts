/**
 * Retainer Monitoring
 *
 * Tracks recurring client relationships and detects:
 * - Forgotten renewals (regular invoicing gaps)
 * - Usage tracking (retainer vs actual hours)
 * - Renewal reminders for known retainer clients
 *
 * Works by analyzing invoice patterns to identify retainer-like relationships
 * (regular monthly/quarterly invoicing) and alerting when a pattern breaks.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
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
}
