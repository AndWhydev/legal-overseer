import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from './approval-queue'
import { generateInvoicePdf } from './invoice-pdf'
import { sendInvoiceEmail } from '@/lib/email/send-invoice'
import type { InvoiceLineItem, InvoiceStatus } from './shared-tools'
import { logger } from '@/lib/core/logger';

interface InvoiceRow {
  id: string
  org_id: string
  invoice_number: string
  client_contact_id: string | null
  status: InvoiceStatus
  items: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  currency: string
  issued_date: string | null
  due_date: string | null
  reminder_count: number
  project_reference: string | null
}

interface ContactRow {
  id: string
  name: string
  emails: string[] | null
}

interface OrganizationRow {
  name: string
  settings: Record<string, unknown> | null
}

interface ApprovedSendRow {
  id: string
  action_payload: Record<string, unknown>
}

interface AgentConfigRow {
  id: string
}

export interface QueueInvoiceSendResult {
  queued: boolean
  approvalId: string | null
  error?: string
}

export interface ProcessInvoiceSendResult {
  processed: number
  sent: number
  failed: number
}

export interface OverdueCheckResult {
  overdue: number
  failed: number
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function resolveInvoiceAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'invoice-flow')
    .limit(1)

  if (error) return null
  const row = (data ?? [])[0] as AgentConfigRow | undefined
  return row?.id ?? null
}

function getPrimaryEmail(contact: ContactRow | null): string | null {
  if (!contact || !Array.isArray(contact.emails)) return null
  const email = contact.emails.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
  return email?.trim() ?? null
}

export function isValidInvoiceStatusTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true

  const allowedTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['viewed', 'overdue', 'paid', 'cancelled'],
    viewed: ['overdue', 'paid', 'cancelled'],
    overdue: ['paid', 'cancelled'],
    paid: [],
    cancelled: [],
  }

  return allowedTransitions[from].includes(to)
}

async function fetchInvoice(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
): Promise<InvoiceRow | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, org_id, invoice_number, client_contact_id, status, items, subtotal, tax, total, currency, issued_date, due_date, reminder_count, project_reference')
    .eq('org_id', orgId)
    .eq('id', invoiceId)
    .single<InvoiceRow>()

  if (error || !data) return null
  return data
}

async function fetchContact(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string | null,
): Promise<ContactRow | null> {
  if (!contactId) return null

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, emails')
    .eq('org_id', orgId)
    .eq('id', contactId)
    .single<ContactRow>()

  if (error || !data) return null
  return data
}

async function fetchOrganization(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrganizationRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('name, settings')
    .eq('id', orgId)
    .single<OrganizationRow>()

  if (error || !data) return null
  return data
}

export async function queueInvoiceSend(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  agentConfigId: string,
): Promise<QueueInvoiceSendResult> {
  const invoice = await fetchInvoice(supabase, orgId, invoiceId)
  if (!invoice) {
    return { queued: false, approvalId: null, error: 'invoice_not_found' }
  }

  const approval = await createApproval(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    action_type: 'invoice_send',
    action_payload: {
      invoice_id: invoice.id,
    },
    action_summary: `Send invoice ${invoice.invoice_number} (${invoice.total} ${invoice.currency})`,
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    context_snapshot: {
      source: 'invoice-sender',
      invoiceId: invoice.id,
    },
  })

  return {
    queued: true,
    approvalId: approval.id,
  }
}

export async function processApprovedInvoiceSends(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ProcessInvoiceSendResult> {
  const result: ProcessInvoiceSendResult = {
    processed: 0,
    sent: 0,
    failed: 0,
  }

  const { data: approvals, error: approvalsError } = await supabase
    .from('approval_queue')
    .select('id, action_payload')
    .eq('org_id', orgId)
    .eq('action_type', 'invoice_send')
    .eq('status', 'approved')

  if (approvalsError) {
    result.failed += 1
    return result
  }

  const organization = await fetchOrganization(supabase, orgId)

  for (const approval of (approvals ?? []) as ApprovedSendRow[]) {
    result.processed += 1

    const invoiceId = readPayloadString(approval.action_payload, 'invoice_id')
    if (!invoiceId) {
      result.failed += 1
      continue
    }

    const invoice = await fetchInvoice(supabase, orgId, invoiceId)
    if (!invoice) {
      result.failed += 1
      continue
    }

    if (invoice.status === 'sent' || invoice.status === 'viewed' || invoice.status === 'overdue' || invoice.status === 'paid') {
      continue
    }

    if (!isValidInvoiceStatusTransition(invoice.status, 'sent')) {
      result.failed += 1
      continue
    }

    const contact = await fetchContact(supabase, orgId, invoice.client_contact_id)
    const email = getPrimaryEmail(contact)
    if (!email) {
      result.failed += 1
      continue
    }

    const orgSettings = (organization?.settings ?? {}) as Record<string, unknown>
    const branding = (orgSettings.branding ?? {}) as Record<string, unknown>
    const orgName = typeof branding.company_name === 'string' ? branding.company_name : (organization?.name ?? 'BitBit')

    const pdf = generateInvoicePdf(
      {
        invoice_number: invoice.invoice_number,
        issued_date: invoice.issued_date ?? new Date().toISOString().slice(0, 10),
        due_date: invoice.due_date ?? new Date().toISOString().slice(0, 10),
        client_name: contact?.name ?? 'Client',
        client_email: email,
        items: invoice.items ?? [],
        subtotal: Number(invoice.subtotal ?? 0),
        tax: Number(invoice.tax ?? 0),
        total: Number(invoice.total ?? 0),
        currency: invoice.currency || 'AUD',
        project_reference: invoice.project_reference,
      },
      {
        company_name: orgName,
        logo_url: typeof branding.logo_url === 'string' ? branding.logo_url : undefined,
        primary_color: typeof branding.primary_color === 'string' ? branding.primary_color : undefined,
      },
    )

    if (pdf.html.length === 0) {
      result.failed += 1
      continue
    }

    const dueDate = invoice.due_date ?? new Date().toISOString().slice(0, 10)
    const projectRef = invoice.project_reference || 'Services'

    // Send email via Resend if configured
    const emailResult = await sendInvoiceEmail({
      to: email,
      invoiceNumber: invoice.invoice_number,
      html: pdf.html,
      from: `${orgName} Invoices <invoices@bitbit.chat>`,
      subject: `Invoice ${invoice.invoice_number} \u2014 ${projectRef} \u2014 Due ${dueDate}`,
    })

    if (!emailResult.success) {
      logger.error(`Failed to send invoice ${invoice.invoice_number} email:`, emailResult.error)
      // Still update status if RESEND_API_KEY isn't configured (dev mode)
      if (emailResult.error !== 'RESEND_API_KEY not configured') {
        result.failed += 1
        continue
      }
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_via: 'email',
        pdf_url: `inline:invoice-${invoice.invoice_number}.html`,
        issued_date: invoice.issued_date ?? new Date().toISOString().slice(0, 10),
      })
      .eq('id', invoice.id)
      .eq('org_id', orgId)

    if (updateError) {
      result.failed += 1
      continue
    }

    result.sent += 1
  }

  return result
}

export async function checkOverdueInvoices(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OverdueCheckResult> {
  const result: OverdueCheckResult = {
    overdue: 0,
    failed: 0,
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, org_id, invoice_number, client_contact_id, status, items, subtotal, tax, total, currency, issued_date, due_date, reminder_count, project_reference')
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed'])
    .lt('due_date', today)

  if (error) {
    result.failed += 1
    return result
  }

  const agentConfigId = await resolveInvoiceAgentConfigId(supabase, orgId)

  for (const invoice of (invoices ?? []) as InvoiceRow[]) {
    if (!isValidInvoiceStatusTransition(invoice.status, 'overdue')) {
      result.failed += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'overdue',
        reminder_count: Number(invoice.reminder_count ?? 0) + 1,
      })
      .eq('id', invoice.id)
      .eq('org_id', orgId)

    if (updateError) {
      result.failed += 1
      continue
    }

    if (agentConfigId) {
      await createApproval(supabase, {
        org_id: orgId,
        agent_config_id: agentConfigId,
        action_type: 'invoice_overdue_notify',
        action_payload: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          due_date: invoice.due_date,
          reminder_count: Number(invoice.reminder_count ?? 0) + 1,
        },
        action_summary: `Send overdue reminder for invoice ${invoice.invoice_number}`,
        confidence_score: 0,
        routing_decision: 'ask',
        priority: 'normal',
        context_snapshot: {
          source: 'invoice-sender',
          invoiceId: invoice.id,
          trigger: 'overdue',
        },
      })
    }

    result.overdue += 1
  }

  return result
}

export interface InvoiceLifecycleResult {
  updated: boolean
  error?: string
}

export async function markInvoiceViewed(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
): Promise<InvoiceLifecycleResult> {
  const invoice = await fetchInvoice(supabase, orgId, invoiceId)
  if (!invoice) {
    return { updated: false, error: 'invoice_not_found' }
  }

  if (!isValidInvoiceStatusTransition(invoice.status, 'viewed')) {
    return { updated: false, error: `invalid_transition:${invoice.status}->viewed` }
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'viewed',
      viewed_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('org_id', orgId)

  if (error) {
    return { updated: false, error: error.message }
  }

  return { updated: true }
}

export async function markInvoicePaid(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  paymentDetails?: { method?: string; reference?: string },
): Promise<InvoiceLifecycleResult> {
  const invoice = await fetchInvoice(supabase, orgId, invoiceId)
  if (!invoice) {
    return { updated: false, error: 'invoice_not_found' }
  }

  if (!isValidInvoiceStatusTransition(invoice.status, 'paid')) {
    return { updated: false, error: `invalid_transition:${invoice.status}->paid` }
  }

  const updatePayload: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
  }
  if (paymentDetails?.method) {
    updatePayload.payment_method = paymentDetails.method
  }
  if (paymentDetails?.reference) {
    updatePayload.payment_reference = paymentDetails.reference
  }

  const { error } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .eq('org_id', orgId)

  if (error) {
    return { updated: false, error: error.message }
  }

  return { updated: true }
}
