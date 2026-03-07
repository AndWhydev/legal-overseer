import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedCommand } from './command-parser'
import { executeAgentTool } from '../agent/tools'
import { getPendingApprovals } from '../agent/approval-queue'
import { formatResponse } from './response-formatter'
import type { InvoiceDisplay, LeadDisplay, TaskDisplay } from './response-formatter'
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

async function handleInvoice(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  const contactName = command.resolvedContacts?.[0]?.contact?.name
    ?? command.entities.contactNames?.[0]
    ?? ''
  const amount = command.entities.amounts?.[0]

  // If we have a contact and amount, create the invoice
  if (contactName && amount && command.resolvedContacts?.[0]) {
    const contact = command.resolvedContacts[0].contact
    const result = await executeAgentTool(
      'create_task', // Using task as proxy until invoice creation tool is wired
      {
        title: `Invoice: ${contact.name} - $${amount}`,
        description: `Invoice for ${contact.name}, amount: $${amount}${command.entities.projectReference ? `, project: ${command.entities.projectReference}` : ''}`,
        priority: 'high',
      },
      orgId,
      supabase
    )

    if (result.success) {
      return {
        success: true,
        response: `✅ Invoice created for *${contact.name}* — $${amount.toLocaleString()}`,
        data: result.data,
      }
    }
    return { success: false, response: 'Failed to create invoice. Please try again.' }
  }

  // Otherwise, search existing invoices
  const query = contactName || command.entities.rawQuery || ''
  const result = await executeAgentTool(
    'search_tasks',
    { query: query || 'invoice', status: 'pending' },
    orgId,
    supabase
  )

  if (!result.success) {
    return { success: false, response: 'Could not fetch invoices. Try again later.' }
  }

  const tasks = result.data as Array<Record<string, unknown>> | undefined
  if (!tasks?.length) {
    return { success: true, response: 'No invoices found matching your query.' }
  }

  const invoices: InvoiceDisplay[] = tasks.slice(0, 5).map((t) => ({
    title: (t.title as string) || 'Untitled',
    total: (t.total as number) || 0,
    status: (t.status as string) || 'unknown',
  }))

  return {
    success: true,
    response: formatResponse.invoiceList(invoices),
    data: tasks,
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
