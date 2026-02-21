import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { channelToolDefinitions, channelToolHandlers } from './tools/channel-tools'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeTaskEvent } from '@/lib/context/timeline-writer'
import { linkTaskToContact } from '@/lib/context/relationship-linker'

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type AgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string
) => Promise<ToolResult>

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description:
      'Create a new task on the kanban board. Use this when the user asks to add a task, todo, or action item.',
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
    description: 'Log an action to the activity feed for transparency and auditability.',
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
    description: 'Search stored memory/knowledge entries for learned patterns and preferences.',
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
    description: 'Store a new memory/knowledge entry. Use to remember user preferences, patterns, and important context.',
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

async function getSupabase() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function resolveColumnId(orgId: string, columnName: string): Promise<string | null> {
  const supabase = await getSupabase()
  const { data } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .ilike('title', columnName)
    .limit(1)
    .single()
  return data?.id ?? null
}

const handlers: Record<string, AgentToolHandler> = {
  async create_task(input, orgId) {
    const supabase = await getSupabase()

    let columnId = input.column_id as string | undefined
    if (!columnId && input.column) {
      columnId = (await resolveColumnId(orgId, input.column as string)) ?? undefined
    }
    if (!columnId) {
      // Default to "To Do" column
      columnId = (await resolveColumnId(orgId, 'To Do')) ?? undefined
    }

    // Get next position in column
    const { count } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('column_id', columnId!)

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        org_id: orgId,
        title: input.title as string,
        description: (input.description as string) || null,
        priority: (input.priority as string) || 'medium',
        column_id: columnId,
        position: count ?? 0,
        metadata: input.tags ? { tags: input.tags } : {},
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    // Write timeline event for task creation
    writeTaskEvent(orgId, data.id, 'task_created', {
      title: input.title as string,
      column: input.column as string | undefined,
      priority: (input.priority as string) || 'medium',
    })

    // Link task to contact if contact_id provided
    if (input.contact_id) {
      linkTaskToContact(orgId, data.id, input.contact_id as string)
    }

    return { success: true, data }
  },

  async update_task(input, orgId) {
    const supabase = await getSupabase()
    const updates: Record<string, unknown> = {}

    if (input.title) updates.title = input.title
    if (input.description !== undefined) updates.description = input.description
    if (input.status) updates.status = input.status
    if (input.priority) updates.priority = input.priority
    if (input.column) {
      const colId = await resolveColumnId(orgId, input.column as string)
      if (colId) updates.column_id = colId
    }
    if (input.column_id) updates.column_id = input.column_id

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', input.task_id as string)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    // Write timeline event for task update
    writeTaskEvent(orgId, input.task_id as string, 'task_updated', updates)

    // Also write task_completed if status changed to completed
    if (input.status === 'completed') {
      writeTaskEvent(orgId, input.task_id as string, 'task_completed', updates)
    }

    return { success: true, data }
  },

  async search_tasks(input, orgId) {
    const supabase = await getSupabase()
    let query = supabase.from('tasks').select('*').eq('org_id', orgId)

    if (input.status) query = query.eq('status', input.status as string)
    if (input.priority) query = query.eq('priority', input.priority as string)
    if (input.query) {
      query = query.or(`title.ilike.%${input.query}%,description.ilike.%${input.query}%`)
    }

    const { data, error } = await query.order('position').limit(20)
    if (error) return { success: false, error: error.message }
    return { success: true, data: { results: data, total: data?.length ?? 0 } }
  },

  async search_contacts(input, orgId) {
    const query = input.query as string
    const ranked = await resolveEntityRanked(query, orgId)
    const results = ranked.map((r) => ({
      ...r.contact,
      matchConfidence: r.matchConfidence,
      matchStep: r.matchStep,
    }))
    return { success: true, data: { results, total: results.length } }
  },

  async get_contact(input, orgId) {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('org_id', orgId)
      .eq('slug', input.slug as string)
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  },

  async log_activity(input, orgId) {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('activity_feed')
      .insert({
        org_id: orgId,
        action_type: input.action_type as string,
        action: input.action as string,
        reasoning: (input.reasoning as string) || null,
        result: (input.result as string) || null,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  },

  async search_memory(input, orgId) {
    const supabase = await getSupabase()
    let query = supabase.from('memory_entries').select('*').eq('org_id', orgId)

    if (input.category) query = query.eq('category', input.category as string)
    if (input.query) query = query.ilike('content', `%${input.query}%`)

    const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
    if (error) return { success: false, error: error.message }
    return { success: true, data: { results: data, total: data?.length ?? 0 } }
  },

  async add_memory(input, orgId) {
    const supabase = await getSupabase()
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
}

export function getAgentTools(): Anthropic.Tool[] {
  return [...toolDefinitions, ...channelToolDefinitions]
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string
): Promise<ToolResult> {
  const handler = allHandlers[name]
  if (!handler) {
    return { success: false, error: `Unknown tool: ${name}` }
  }
  try {
    return await handler(input, orgId)
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
