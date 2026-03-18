/**
 * Revenue Digest Generator
 *
 * Produces weekly/monthly revenue summaries with highlights.
 * All monetary values in cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueDigest, DigestHighlight } from './types'
import { dollarsToCents, formatCents } from './types'

export async function generateDigest(
  supabase: SupabaseClient,
  orgId: string,
  periodType: 'weekly' | 'monthly' = 'weekly',
): Promise<RevenueDigest> {
  const now = new Date()
  let periodStart: Date
  let periodEnd: Date

  if (periodType === 'weekly') {
    // Last 7 days
    periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else {
    // Last calendar month
    periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    periodEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  }

  const startStr = periodStart.toISOString().slice(0, 10)
  const endStr = periodEnd.toISOString().slice(0, 10)

  // Invoices sent in period
  const { data: sentInvoices } = await supabase
    .from('invoices')
    .select('id, total, status, issued_date')
    .eq('org_id', orgId)
    .gte('issued_date', startStr)
    .lte('issued_date', endStr)
    .neq('status', 'cancelled')

  // Invoices paid in period
  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('id, total, paid_date')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', startStr)
    .lte('paid_date', endStr)

  // Currently overdue
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, total')
    .eq('org_id', orgId)
    .eq('status', 'overdue')

  // Cash flow projection
  const { data: projection } = await supabase
    .from('cash_flow_projections')
    .select('inflow_30d_cents')
    .eq('org_id', orgId)
    .order('projection_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // New clients (contacts created in period with invoices)
  const { data: newContacts } = await supabase
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString())

  const invoicedCents = (sentInvoices ?? []).reduce(
    (sum, i) => sum + dollarsToCents(parseFloat(String(i.total)) || 0), 0,
  )
  const receivedCents = (paidInvoices ?? []).reduce(
    (sum, i) => sum + dollarsToCents(parseFloat(String(i.total)) || 0), 0,
  )
  const overdueCents = (overdueInvoices ?? []).reduce(
    (sum, i) => sum + dollarsToCents(parseFloat(String(i.total)) || 0), 0,
  )

  // Build highlights
  const highlights: DigestHighlight[] = []

  if (receivedCents > 0) {
    highlights.push({
      type: 'positive',
      text: `Received ${formatCents(receivedCents)} from ${(paidInvoices ?? []).length} payment(s)`,
      impact_cents: receivedCents,
    })
  }

  if (invoicedCents > 0) {
    highlights.push({
      type: 'neutral',
      text: `Sent ${formatCents(invoicedCents)} in ${(sentInvoices ?? []).length} invoice(s)`,
      impact_cents: invoicedCents,
    })
  }

  if (overdueCents > 0) {
    highlights.push({
      type: 'negative',
      text: `${formatCents(overdueCents)} overdue across ${(overdueInvoices ?? []).length} invoice(s)`,
      impact_cents: overdueCents,
    })
  }

  if ((newContacts ?? []).length > 0) {
    highlights.push({
      type: 'positive',
      text: `${(newContacts ?? []).length} new contact(s) added`,
    })
  }

  // Active insights count
  const { count: insightCount } = await supabase
    .from('revenue_insights')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')

  if (insightCount && insightCount > 0) {
    highlights.push({
      type: 'neutral',
      text: `${insightCount} active revenue insight(s) requiring attention`,
    })
  }

  const digest: Omit<RevenueDigest, 'id' | 'created_at'> = {
    org_id: orgId,
    period_type: periodType,
    period_start: startStr,
    period_end: endStr,
    invoiced_cents: invoicedCents,
    received_cents: receivedCents,
    overdue_cents: overdueCents,
    projected_30d_cents: projection?.inflow_30d_cents ?? 0,
    invoices_sent: (sentInvoices ?? []).length,
    invoices_paid: (paidInvoices ?? []).length,
    new_clients: (newContacts ?? []).length,
    highlights,
    delivered_at: null,
    delivery_channel: null,
  }

  const { data, error } = await supabase
    .from('revenue_digests')
    .upsert(digest, { onConflict: 'org_id,period_type,period_start' })
    .select('*')
    .single()

  if (error) {
    logger.error('[revenue-digest] Failed to store digest', { error: error.message })
    throw error
  }

  return data as RevenueDigest
}
