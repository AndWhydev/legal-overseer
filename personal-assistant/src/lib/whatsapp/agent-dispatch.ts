import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedCommand } from './command-parser'
import { executeAgentTool } from '../agent/tools'
import { getPendingApprovals } from '../agent/approval-queue'
import { createInvoiceFromIntent, type InvoiceIntent, type CreateInvoiceFromIntentResult } from '../agent/invoice-flow'
import { searchInvoices } from '../agent/shared-tools'
import { formatResponse } from './response-formatter'
import type { InvoiceDisplay, LeadDisplay } from './response-formatter'
import { logger } from '@/lib/core/logger';

export interface DispatchResult {
  success: boolean
  response: string
  data?: unknown
}

/**
 * Dispatch a parsed WhatsApp command to the appropriate agent tool or service.
 * Returns a WhatsApp-friendly formatted response.
 */
export async function dispatchCommand(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  try {
    switch (command.intent) {
      case 'invoice':
        return await handleInvoice(supabase, orgId, command)

      case 'lead_status':
        return await handleLeadStatus(supabase, orgId, command)

      case 'schedule':
        return await handleSchedule(supabase, orgId, command)

      case 'task_create':
        return await handleTaskCreate(supabase, orgId, command)

      case 'report':
        return await handleReport(supabase, orgId, command)

      case 'search':
        return await handleSearch(supabase, orgId, command)

      case 'approve':
        return await handleApprovalList(supabase, orgId)

      case 'help':
        return { success: true, response: formatResponse.helpMenu() }

      default:
        return {
          success: true,
          response: formatResponse.didNotUnderstand('', [
            'Check leads',
            'Invoice status',
            'Create a task',
            'Help',
          ]),
        }
    }
  } catch (err) {
    logger.error('[agent-dispatch] Error:', err)
    return {
      success: false,
      response: formatResponse.error(
        'Something went wrong. Please try again.',
        ['Try "help" to see available commands']
      ),
    }
  }
}

/**
 * Resolve the invoice-flow agent_config_id for an org.
 * Looks up the first agent_configs row with agent_type='invoice-flow'.
 * Returns null if no config exists (invoice agent not provisioned for this org).
 */
async function resolveInvoiceAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'invoice-flow')
    .limit(1)

  const first = (data ?? [])[0] as { id: string } | undefined
  return first?.id ?? null
}

/**
 * Build a WhatsApp-friendly response from a createInvoiceFromIntent result.
 */
function formatInvoiceOutcome(
  outcome: CreateInvoiceFromIntentResult,
  contactName: string,
  amount: number | null,
): DispatchResult {
  switch (outcome.status) {
    case 'queued':
      return {
        success: true,
        response: `Queued invoice for *${contactName}*${amount ? ` — $${amount.toLocaleString()}` : ''}. Awaiting your approval.`,
        data: { approvalId: outcome.approvalId },
      }

    case 'created':
      return {
        success: true,
        response: `Invoice *${outcome.invoiceNumber}* created for *${contactName}*${amount ? ` — $${amount.toLocaleString()}` : ''}.`,
        data: { invoiceId: outcome.invoiceId, invoiceNumber: outcome.invoiceNumber },
      }

    case 'duplicate': {
      const existingNum = outcome.existingInvoiceNumber ?? outcome.existingInvoiceId
      return {
        success: true,
        response: `Duplicate detected — invoice *${existingNum}* already exists for this contact/project. An override request has been queued for your approval.`,
        data: { existingInvoiceId: outcome.existingInvoiceId, overrideApprovalId: outcome.overrideApprovalId },
      }
    }

    case 'error':
      return {
        success: false,
        response: formatInvoiceError(outcome.error),
      }
  }
}

/**
 * Map invoice-flow error codes to user-friendly WhatsApp messages.
 */
function formatInvoiceError(error: string): string {
  switch (error) {
    case 'missing_contact':
      return 'I need a contact name to create an invoice. Try: "Invoice [name] for $[amount]"'
    case 'unknown_contact':
      return 'I couldn\'t find that contact in your database. Check the name and try again.'
    case 'ambiguous_contact':
      return 'Multiple contacts match that name. Could you be more specific?'
    case 'amount_required':
      return 'I need an amount for the invoice. Try: "Invoice [name] for $[amount]"'
    default:
      return `Failed to create invoice: ${error}. Please try again.`
  }
}

async function handleInvoice(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const contactName = command.resolvedContacts?.[0]?.contact?.name
    ?? command.entities.contactNames?.[0]
    ?? ''
  const amount = command.entities.amounts?.[0] ?? null

  // If we have a contact name, route to the real invoice pipeline
  if (contactName) {
    const agentConfigId = await resolveInvoiceAgentConfigId(supabase, orgId)
    if (!agentConfigId) {
      logger.warn(`[agent-dispatch] No invoice-flow agent config found for org ${orgId}`)
      return {
        success: false,
        response: 'Invoice agent is not configured for your organisation. Please contact support.',
      }
    }

    const intent: InvoiceIntent = {
      source_intent: command.entities.rawQuery ?? `Invoice ${contactName}`,
      contact_name: contactName,
      project_reference: command.entities.projectReference ?? null,
      amount,
      currency: 'AUD',
      terms_days: 14,
    }

    const outcome = await createInvoiceFromIntent(
      supabase,
      orgId,
      intent,
      agentConfigId,
      { requireApproval: true },
    )

    logger.info(JSON.stringify({
      event: 'whatsapp_invoice_dispatch',
      orgId,
      contactName,
      amount,
      outcomeStatus: outcome.status,
    }))

    return formatInvoiceOutcome(outcome, contactName, amount)
  }

  // No contact specified — search existing invoices using the real invoice table
  const searchResult = await searchInvoices(supabase, orgId, {})

  if (!searchResult.success) {
    return { success: false, response: 'Could not fetch invoices. Try again later.' }
  }

  const rows = (searchResult.data?.results ?? []) as Array<Record<string, unknown>>
  if (!rows.length) {
    return { success: true, response: 'No invoices found.' }
  }

  const invoices: InvoiceDisplay[] = rows.slice(0, 5).map((inv) => ({
    title: (inv.invoice_number as string) || (inv.project_reference as string) || 'Untitled',
    total: (inv.total as number) || 0,
    status: (inv.status as string) || 'unknown',
  }))

  return {
    success: true,
    response: formatResponse.invoiceList(invoices),
    data: rows,
  }
}

async function handleLeadStatus(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const query = command.entities.contactNames?.[0]
    ?? command.entities.rawQuery
    ?? 'lead'

  const result = await executeAgentTool(
    'search_tasks',
    { query, status: 'pending' },
    orgId,
    supabase
  )

  if (!result.success) {
    return { success: false, response: 'Could not fetch leads.' }
  }

  const tasks = result.data as Array<Record<string, unknown>> | undefined
  if (!tasks?.length) {
    return { success: true, response: 'No pending leads right now. 🎉' }
  }

  const leads: LeadDisplay[] = tasks.slice(0, 5).map((t) => ({
    name: (t.title as string) || 'Unnamed',
    stage: (t.status as string) || 'unknown',
    value: t.metadata && typeof t.metadata === 'object'
      ? (t.metadata as Record<string, unknown>).value as number | undefined
      : undefined,
  }))

  return { success: true, response: formatResponse.leadList(leads), data: tasks }
}

async function handleSchedule(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const action = command.entities.scheduleAction ?? 'list'

  if (action === 'create') {
    const title = command.entities.rawQuery ?? 'New event'
    const date = command.entities.dates?.[0] ?? 'today'
    const contact = command.resolvedContacts?.[0]?.contact?.name
      ?? command.entities.contactNames?.[0]

    const description = contact ? `Meeting with ${contact}` : title

    const result = await executeAgentTool(
      'create_task',
      {
        title: description,
        description: `Scheduled for ${date}`,
        priority: 'medium',
        column: 'To Do',
      },
      orgId,
      supabase
    )

    if (result.success) {
      return {
        success: true,
        response: `📅 Scheduled: *${description}* for ${date}`,
      }
    }
    return { success: false, response: 'Failed to create schedule entry.' }
  }

  // Default: list today's schedule
  const result = await executeAgentTool(
    'search_tasks',
    { query: 'schedule today', status: 'pending' },
    orgId,
    supabase
  )

  if (!result.success) {
    return { success: false, response: 'Could not fetch schedule.' }
  }

  const tasks = result.data as Array<Record<string, unknown>> | undefined
  if (!tasks?.length) {
    return {
      success: true,
      response: formatResponse.section('📅', "Today's Schedule", '_Nothing scheduled. Enjoy the free time!_'),
    }
  }

  const items = tasks.slice(0, 5).map((t) =>
    `${(t.title as string) || 'Untitled'}${t.priority ? ` (${t.priority})` : ''}`
  )

  return {
    success: true,
    response: formatResponse.section('📅', "Today's Schedule", formatResponse.numberedList(items)),
    data: tasks,
  }
}

async function handleTaskCreate(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const title = command.entities.rawQuery ?? ''
  if (!title) {
    return { success: false, response: 'What should the task be? E.g., "Create task: follow up with Bob"' }
  }

  const result = await executeAgentTool(
    'create_task',
    {
      title,
      priority: 'medium',
      column: 'To Do',
    },
    orgId,
    supabase
  )

  return {
    success: result.success,
    response: result.success
      ? `✅ Task created: "${title}"`
      : 'Failed to create task. Please try again.',
  }
}

async function handleReport(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const reportType = command.entities.reportType ?? 'weekly'

  // Gather data for the report
  const [tasksResult, pendingApprovals] = await Promise.all([
    executeAgentTool('search_tasks', { status: 'completed' }, orgId, supabase),
    getPendingApprovals(supabase, orgId, { limit: 5 }),
  ])

  const completedTasks = tasksResult.success
    ? (tasksResult.data as Array<Record<string, unknown>> | undefined)?.length ?? 0
    : 0

  const lines: string[] = []
  lines.push(`*${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report*`)
  lines.push(``)
  lines.push(`📊 *Summary*`)
  lines.push(`  - Tasks completed: ${completedTasks}`)
  lines.push(`  - Pending approvals: ${pendingApprovals.length}`)

  if (pendingApprovals.length > 0) {
    lines.push(``)
    lines.push(`⏳ *Pending Approvals*`)
    for (const approval of pendingApprovals.slice(0, 3)) {
      const agentName = approval.agent_name ?? 'Agent'
      lines.push(`  - ${agentName}: ${approval.action_summary}`)
    }
  }

  return {
    success: true,
    response: lines.join('\n'),
  }
}

async function handleSearch(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const query = command.entities.rawQuery
    ?? command.entities.contactNames?.[0]
    ?? ''

  if (!query) {
    return { success: false, response: 'What would you like to search for?' }
  }

  const result = await executeAgentTool(
    'search_contacts',
    { query },
    orgId,
    supabase
  )

  if (result.success && result.data) {
    const data = result.data as { results?: Array<Record<string, unknown>> }
    const contacts = data.results ?? []
    if (contacts.length > 0) {
      const lines = contacts.slice(0, 5).map((c, i) =>
        `${i + 1}. *${c.name}*${c.type ? ` (${c.type})` : ''}`
      )
      return {
        success: true,
        response: formatResponse.section('🔍', 'Search Results', lines.join('\n')),
        data: contacts,
      }
    }
  }

  return { success: true, response: `No results found for "${query}".` }
}

async function handleApprovalList(
  supabase: SupabaseClient,
  orgId: string
): Promise<DispatchResult> {
  const approvals = await getPendingApprovals(supabase, orgId, { limit: 5 })

  if (approvals.length === 0) {
    return { success: true, response: "No pending approvals. You're all caught up! ✅" }
  }

  const lines = approvals.map((a, i) => {
    const agentName = a.agent_name ?? 'Agent'
    return `${i + 1}. ${agentName}: ${a.action_summary}`
  })

  const msg = formatResponse.section(
    '⏳',
    `Pending Approvals (${approvals.length})`,
    lines.join('\n') + '\n\n_Reply with number + Y/N (e.g., "1Y" or "2N")_'
  )

  return { success: true, response: msg, data: approvals }
}
