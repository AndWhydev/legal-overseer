import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedCommand } from './command-parser'
import { executeAgentTool } from '../agent/tools' // TODO: verify export exists at runtime

export interface DispatchResult {
  success: boolean
  response: string
  data?: unknown
}

/**
 * Dispatch a parsed WhatsApp command to the appropriate agent tool.
 * Returns a WhatsApp-friendly formatted response.
 */
export async function dispatchCommand(
  supabase: SupabaseClient,
  orgId: string,
  command: ParsedCommand
): Promise<DispatchResult> {
  try {
    switch (command.intent) {
      case 'invoice': {
        const result = await executeAgentTool(
          'search_invoices',
          { status: 'all', query: command.entities.contactNames?.[0] || command.entities.rawQuery || '' },
          orgId,
          supabase
        )
        if (!result.success) return { success: false, response: 'Could not fetch invoices. Try again later.' }
        const invoices = result.data as Array<Record<string, unknown>>
        if (!invoices?.length) return { success: true, response: 'No invoices found matching your query.' }
        const lines = invoices.slice(0, 5).map((inv: Record<string, unknown>, i: number) =>
          `${i + 1}. ${inv.title || 'Untitled'} — $${inv.total || 0} (${inv.status})`
        )
        return { success: true, response: `📄 *Invoices*\n\n${lines.join('\n')}`, data: invoices }
      }

      case 'lead_status': {
        const result = await executeAgentTool('search_tasks', { query: 'lead', status: 'pending' }, orgId, supabase)
        if (!result.success) return { success: false, response: 'Could not fetch leads.' }
        const tasks = result.data as Array<Record<string, unknown>>
        if (!tasks?.length) return { success: true, response: 'No pending leads right now. 🎉' }
        const lines = tasks.slice(0, 5).map((t: Record<string, unknown>, i: number) =>
          `${i + 1}. ${t.title} (${t.priority})`
        )
        return { success: true, response: `🔥 *Active Leads*\n\n${lines.join('\n')}`, data: tasks }
      }

      case 'task_create': {
        const result = await executeAgentTool(
          'create_task',
          { title: command.entities.rawQuery || '', priority: 'medium' },
          orgId,
          supabase
        )
        return {
          success: result.success,
          response: result.success ? `✅ Task created: "${command.entities.rawQuery || ''}"` : 'Failed to create task.',
        }
      }

      case 'search': {
        const contactResult = await executeAgentTool(
          'search_contacts',
          { query: command.entities.rawQuery || '' },
          orgId,
          supabase
        )
        if (contactResult.success && contactResult.data) {
          const contacts = contactResult.data as Array<Record<string, unknown>>
          if (contacts.length > 0) {
            const lines = contacts.slice(0, 5).map((c: Record<string, unknown>, i: number) =>
              `${i + 1}. ${c.name}${c.type ? ` (${c.type})` : ''}`
            )
            return { success: true, response: `🔍 *Search Results*\n\n${lines.join('\n')}`, data: contacts }
          }
        }
        return { success: true, response: `No results found for "${command.entities.rawQuery || ''}".` }
      }

      case 'approve': {
        return {
          success: true,
          response: '✅ Approval noted. Processing...',
        }
      }

      case 'help': {
        return {
          success: true,
          response: `🤖 *BitBit Commands*\n\nHere's what I can do:\n\n• "Any new leads?" — check lead pipeline\n• "Invoice status" — view recent invoices\n• "Create task: [description]" — add a task\n• "Search [name]" — find contacts\n• "What's overdue?" — check overdue items\n• "Approve" — approve pending actions\n\nJust text naturally — I'll figure out what you need!`,
        }
      }

      default:
        return {
          success: true,
          response: "I'm not sure what you need. Try \"help\" to see what I can do, or just describe what you're looking for.",
        }
    }
  } catch (err) {
    console.error('[agent-dispatch] Error:', err)
    return { success: false, response: 'Something went wrong. Please try again.' }
  }
}
