import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { channelToolDefinitions, channelToolHandlers } from './tools/channel-tools'
import { webToolDefinitions, webToolHandlers } from './tools/web-tools'
import {
  createTask,
  updateTask,
  searchTasks,
  searchContacts,
  getContact,
  logActivity,
} from './shared-tools'

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type AgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
) => Promise<ToolResult>

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description:
      'Create a task on the kanban board. Use when the user asks to add a task, todo, or action item. Set priority and column. Returns the created task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Task priority level',
        },
        column: {
          type: 'string',
          description: 'Column name to place the task in: "Backlog", "To Do", "In Progress", "Review", or "Done"',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task. Use this to change status, priority, description, or move between columns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to update' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'archived'] },
        column: { type: 'string', description: 'Move to column by name' },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'search_tasks',
    description: 'Search tasks by keyword, status, or priority. Returns matching tasks from the kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (matches title and description)' },
        status: { type: 'string', description: 'Filter by status' },
        priority: { type: 'string', description: 'Filter by priority' },
      },
    },
  },
  {
    name: 'search_contacts',
    description:
      'Search contacts by name, alias, email, or phone number. Uses entity resolution across all known aliases.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (name, email, phone, or alias)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_contact',
    description: 'Get full contact profile including communication patterns and all stored data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: 'Contact slug identifier' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'log_activity',
    description: 'Log an action to the activity feed. Use after completing significant actions (sending emails, creating tasks, finishing research) so the user can see what you did.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: {
          type: 'string',
          enum: ['task', 'email', 'agent', 'system', 'research'],
          description: 'Type of action',
        },
        action: { type: 'string', description: 'What was done' },
        reasoning: { type: 'string', description: 'Why this action was taken' },
        result: { type: 'string', description: 'Outcome of the action' },
      },
      required: ['action_type', 'action'],
    },
  },
  {
    name: 'search_memory',
    description: 'Search stored memories by keyword or category. Use when the user asks about something you may have learned in past sessions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Filter by category' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_memory',
    description: 'Store a memory. Use when the user tells you a preference, pattern, or fact worth remembering across sessions. Don\'t store ephemeral task details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Memory content to store' },
        category: {
          type: 'string',
          enum: ['preference', 'pattern', 'domain', 'contact', 'workflow'],
          description: 'Memory category',
        },
        confidence: {
          type: 'number',
          description: 'Confidence level 0-1',
        },
      },
      required: ['content', 'category'],
    },
  },
]

// Thin wrappers: parse Record<string, unknown> -> call typed shared function -> return ToolResult
// These receive the Supabase client and pass it to shared-tools
const handlers: Record<string, AgentToolHandler> = {
  async create_task(input, orgId, supabase) {
    return createTask(supabase, orgId, {
      title: input.title as string,
      description: input.description as string | undefined,
      priority: input.priority as string | undefined,
      column: input.column as string | undefined,
      contact_id: input.contact_id as string | undefined,
      tags: input.tags as string[] | undefined,
    })
  },

  async update_task(input, orgId, supabase) {
    return updateTask(supabase, orgId, input.task_id as string, {
      title: input.title as string | undefined,
      description: input.description as string | undefined,
      status: input.status as string | undefined,
      column: input.column as string | undefined,
      priority: input.priority as string | undefined,
    })
  },

  async search_tasks(input, orgId, supabase) {
    return searchTasks(supabase, orgId, {
      query: input.query as string | undefined,
      status: input.status as string | undefined,
      priority: input.priority as string | undefined,
    })
  },

  async search_contacts(input, orgId, supabase) {
    const matches = await searchContacts(supabase, orgId, input.query as string)
    const results = matches.map((m) => ({
      ...m.contact,
      matchConfidence: m.matchConfidence,
      matchStep: m.matchStep,
    }))
    return { success: true, data: { results, total: results.length } }
  },

  async get_contact(input, orgId, supabase) {
    const contact = await getContact(supabase, orgId, input.slug as string)
    if (!contact) return { success: false, error: 'Contact not found' }
    return { success: true, data: contact }
  },

  async log_activity(input, orgId, supabase) {
    return logActivity(supabase, orgId, {
      action_type: input.action_type as string,
      action: input.action as string,
      reasoning: input.reasoning as string | undefined,
      result: input.result as string | undefined,
    })
  },

  // Memory tools stay in tools.ts (not shared — chat-specific)
  async search_memory(input, orgId, supabase) {
    let query = supabase.from('memory_entries').select('*').eq('org_id', orgId)

    if (input.category) query = query.eq('category', input.category as string)
    if (input.query) query = query.ilike('content', `%${input.query}%`)

    const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
    if (error) return { success: false, error: error.message }
    return { success: true, data: { results: data, total: data?.length ?? 0 } }
  },

  async add_memory(input, orgId, supabase) {
    const { data, error } = await supabase
      .from('memory_entries')
      .insert({
        org_id: orgId,
        content: input.content as string,
        category: input.category as string,
        confidence: (input.confidence as number) ?? 0.8,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  },
}

const allHandlers: Record<string, AgentToolHandler> = {
  ...handlers,
  ...channelToolHandlers,
  ...webToolHandlers,
}

export function getAgentTools(): Anthropic.Tool[] {
  return [...toolDefinitions, ...channelToolDefinitions, ...webToolDefinitions]
}

const TOOL_TIMEOUT_MS = 30_000

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const handler = allHandlers[name]
  if (!handler) {
    return { success: false, error: `Unknown tool: ${name}` }
  }
  try {
    const result = await Promise.race([
      handler(input, orgId, supabase),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${name} timed out after 30 seconds`)), TOOL_TIMEOUT_MS)
      ),
    ])
    return result
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
