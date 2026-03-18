/**
 * Payment Pattern Analysis
 *
 * Learns per-client payment behavior from invoice history:
 * - Average/median days to pay
 * - On-time rate
 * - Preferred payment method
 * - Optimal reminder timing
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { PaymentPattern } from './types'

export async function analyzePaymentPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<Omit<PaymentPattern, 'id' | 'updated_at'>> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total, status, issued_date, due_date, paid_date, payment_method, reminder_count')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  const rows = invoices ?? []
  const paidInvoices = rows.filter(r => r.status === 'paid' && r.issued_date && r.paid_date)

  // Days to pay
  const daysToPay: number[] = []
  for (const inv of paidInvoices) {
    const issued = new Date(inv.issued_date!)
    const paid = new Date(inv.paid_date!)
    const days = Math.max(0, Math.floor((paid.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000)))
    daysToPay.push(days)
  }

  daysToPay.sort((a, b) => a - b)

  const avgDaysToPay = daysToPay.length > 0
    ? Math.round((daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length) * 10) / 10
    : null

  const medianDaysToPay = daysToPay.length > 0
    ? daysToPay[Math.floor(daysToPay.length / 2)]
    : null

  // On-time rate
  const onTimePaid = paidInvoices.filter(inv => {
    if (!inv.due_date || !inv.paid_date) return false
    return new Date(inv.paid_date) <= new Date(inv.due_date)
  }).length

  const onTimeRate = paidInvoices.length > 0 ? Math.round((onTimePaid / paidInvoices.length) * 100) / 100 : null

  // Preferred payment method
  const methodCounts: Record<string, number> = {}
  for (const inv of paidInvoices) {
    if (inv.payment_method) {
      methodCounts[inv.payment_method] = (methodCounts[inv.payment_method] ?? 0) + 1
    }
  }
  const preferredMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Reminder response rate
  const remindedInvoices = rows.filter(r => r.reminder_count > 0)
  const remindedThenPaid = remindedInvoices.filter(r => r.status === 'paid')
  const reminderResponseRate = remindedInvoices.length > 0
    ? Math.round((remindedThenPaid.length / remindedInvoices.length) * 100) / 100
    : null

  // Optimal reminder day (day of week payments are most common)
  const dayOfWeekCounts: number[] = [0, 0, 0, 0, 0, 0, 0]
  for (const inv of paidInvoices) {
    if (inv.paid_date) {
      const day = new Date(inv.paid_date).getDay()
      dayOfWeekCounts[day]++
    }
  }
  const optimalDay = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
  // Send reminder 1 day before optimal payment day
  const optimalReminderDay = optimalDay === 0 ? 6 : optimalDay - 1

  return {
    org_id: orgId,
    contact_id: contactId,
    avg_days_to_pay: avgDaysToPay,
    median_days_to_pay: medianDaysToPay,
    fastest_payment_days: daysToPay.length > 0 ? daysToPay[0] : null,
    slowest_payment_days: daysToPay.length > 0 ? daysToPay[daysToPay.length - 1] : null,
    preferred_payment_method: preferredMethod,
    on_time_rate: onTimeRate,
    reminder_response_rate: reminderResponseRate,
    optimal_reminder_day: paidInvoices.length >= 3 ? optimalReminderDay : null,
    total_invoices_analyzed: rows.length,
    computed_at: new Date().toISOString(),
  }
}

export async function analyzeAllPaymentPatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ analyzed: number; errors: number }> {
  const { data: contacts } = await supabase
    .from('invoices')
    .select('client_contact_id')
    .eq('org_id', orgId)
    .not('client_contact_id', 'is', null)

  if (!contacts || contacts.length === 0) return { analyzed: 0, errors: 0 }

  const uniqueIds = [...new Set(contacts.map(c => c.client_contact_id).filter(Boolean))]
  let analyzed = 0
  let errors = 0

  for (const contactId of uniqueIds) {
    try {
      const pattern = await analyzePaymentPattern(supabase, orgId, contactId)

      const { error } = await supabase
        .from('payment_patterns')
        .upsert(pattern, { onConflict: 'org_id,contact_id' })

      if (error) {
        logger.error('[payment-patterns] Upsert failed', { contactId, error: error.message })
        errors++
      } else {
        analyzed++
      }
    } catch (err) {
      logger.error('[payment-patterns] Analysis failed', {
        contactId,
        error: err instanceof Error ? err.message : String(err),
      })
      errors++
    }
  }

  return { analyzed, errors }
}
