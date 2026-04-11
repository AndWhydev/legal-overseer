/**
 * Collection Accelerator
 *
 * Escalating reminder system for overdue invoices:
 * 1. Gentle (3 days overdue): friendly check-in
 * 2. Standard (7 days): firm but professional reminder
 * 3. Urgent (14 days): escalation with payment options
 * 4. Final (30 days): formal demand with next steps
 *
 * Uses per-client payment patterns to optimize timing.
 * Generates reminder actions that go through the autonomy gate.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { dollarsToCents, formatCents } from './types'

// ─── Reminder Steps ──────────────────────────────────────────────────────────

interface ReminderStep {
  level: number
  name: string
  days_overdue_min: number
  tone: 'gentle' | 'firm' | 'urgent' | 'formal'
}

const REMINDER_STEPS: ReminderStep[] = [
  { level: 1, name: 'gentle_checkin', days_overdue_min: 3, tone: 'gentle' },
  { level: 2, name: 'standard_reminder', days_overdue_min: 7, tone: 'firm' },
  { level: 3, name: 'urgent_followup', days_overdue_min: 14, tone: 'urgent' },
  { level: 4, name: 'final_demand', days_overdue_min: 30, tone: 'formal' },
]

function getNextReminderStep(currentReminderCount: number, daysOverdue: number): ReminderStep | null {
  // Find the appropriate step based on days overdue and reminders already sent
  for (const step of REMINDER_STEPS) {
    if (step.level > currentReminderCount && daysOverdue >= step.days_overdue_min) {
      return step
    }
  }
  return null
}

// ─── Reminder Message Templates ──────────────────────────────────────────────

function buildReminderContext(
  tone: ReminderStep['tone'],
  invoiceNumber: string,
  amount: string,
  daysOverdue: number,
  clientName: string,
): { subject: string; context: string } {
  switch (tone) {
    case 'gentle':
      return {
        subject: `Friendly reminder: Invoice ${invoiceNumber}`,
        context: `Just a quick check-in about invoice ${invoiceNumber} for ${amount} to ${clientName}. It's ${daysOverdue} days past due — may have been missed. A friendly nudge is appropriate.`,
      }
    case 'firm':
      return {
        subject: `Payment reminder: Invoice ${invoiceNumber}`,
        context: `Invoice ${invoiceNumber} for ${amount} to ${clientName} is now ${daysOverdue} days overdue. This is a standard professional reminder. Request payment at their earliest convenience.`,
      }
    case 'urgent':
      return {
        subject: `Urgent: Invoice ${invoiceNumber} — ${daysOverdue} days overdue`,
        context: `Invoice ${invoiceNumber} for ${amount} to ${clientName} is ${daysOverdue} days overdue despite previous reminders. This needs urgent attention. Offer to discuss payment options.`,
      }
    case 'formal':
      return {
        subject: `Final notice: Invoice ${invoiceNumber}`,
        context: `Invoice ${invoiceNumber} for ${amount} to ${clientName} is ${daysOverdue} days overdue. This is a formal demand for payment. Outline the amount due, original due date, and request immediate payment.`,
      }
  }
}

// ─── Main: Generate Collection Actions ──────────────────────────────────────

interface CollectionAction {
  invoice_id: string
  invoice_number: string
  contact_id: string
  contact_name: string
  amount_cents: number
  days_overdue: number
  reminder_level: number
  reminder_name: string
  tone: string
  subject: string
  context: string
}

export async function generateCollectionActions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CollectionAction[]> {
  const now = new Date()

  // Fetch overdue invoices
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, due_date, client_contact_id, reminder_count, status')
    .eq('org_id', orgId)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })

  if (!overdueInvoices || overdueInvoices.length === 0) return []

  // Also check sent/viewed invoices that are past due but not yet marked overdue
  const { data: pastDueInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, due_date, client_contact_id, reminder_count, status')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])
    .lt('due_date', now.toISOString().slice(0, 10))

  const allOverdue = [...(overdueInvoices ?? []), ...(pastDueInvoices ?? [])]

  // Fetch contact names
  const contactIds = [...new Set(allOverdue.map(i => i.client_contact_id).filter(Boolean))]
  const contactNames: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .in('id', contactIds)
    for (const c of contacts ?? []) {
      contactNames[c.id] = c.name
    }
  }

  // Check payment patterns for optimal timing
  const paymentPatterns: Record<string, { optimal_reminder_day?: number | null }> = {}
  if (contactIds.length > 0) {
    const { data: patterns } = await supabase
      .from('payment_patterns')
      .select('contact_id, optimal_reminder_day')
      .eq('org_id', orgId)
      .in('contact_id', contactIds)
    for (const p of patterns ?? []) {
      paymentPatterns[p.contact_id] = p
    }
  }

  const actions: CollectionAction[] = []

  for (const inv of allOverdue) {
    if (!inv.due_date) continue

    const dueDate = new Date(inv.due_date)
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))

    if (daysOverdue < 3) continue // Too early for reminders

    const nextStep = getNextReminderStep(inv.reminder_count ?? 0, daysOverdue)
    if (!nextStep) continue // All reminders already sent

    // Check optimal reminder day (skip if today isn't the best day)
    const pattern = paymentPatterns[inv.client_contact_id]
    if (pattern?.optimal_reminder_day !== null && pattern?.optimal_reminder_day !== undefined) {
      const todayDow = now.getDay()
      // Only skip if we have strong data AND it's more than 1 day from optimal
      if (Math.abs(todayDow - pattern.optimal_reminder_day) > 1 && daysOverdue < 14) {
        continue
      }
    }

    const amountCents = dollarsToCents(parseFloat(String(inv.total)) || 0)
    const contactName = contactNames[inv.client_contact_id] ?? 'Unknown client'
    const { subject, context } = buildReminderContext(
      nextStep.tone,
      inv.invoice_number,
      formatCents(amountCents),
      daysOverdue,
      contactName,
    )

    actions.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      contact_id: inv.client_contact_id,
      contact_name: contactName,
      amount_cents: amountCents,
      days_overdue: daysOverdue,
      reminder_level: nextStep.level,
      reminder_name: nextStep.name,
      tone: nextStep.tone,
      subject,
      context,
    })
  }

  // Sort by urgency (most overdue first)
  actions.sort((a, b) => b.days_overdue - a.days_overdue)

  logger.info('[collection-accelerator] Generated actions', {
    orgId,
    overdue_count: allOverdue.length,
    actions_generated: actions.length,
  })

  return actions
}

/**
 * Record that a reminder was sent for an invoice.
 * Increments the reminder_count and updates the insight status.
 */
export async function recordReminderSent(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
): Promise<void> {
  // Increment reminder count
  const { data: inv } = await supabase
    .from('invoices')
    .select('reminder_count')
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .single()

  if (inv) {
    await supabase
      .from('invoices')
      .update({ reminder_count: (inv.reminder_count ?? 0) + 1 })
      .eq('id', invoiceId)
      .eq('org_id', orgId)
  }

  // Mark related insight as acted on
  await supabase
    .from('revenue_insights')
    .update({
      status: 'acted_on',
      acted_on_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('invoice_id', invoiceId)
    .eq('insight_type', 'overdue_collection')
    .eq('status', 'active')
}
