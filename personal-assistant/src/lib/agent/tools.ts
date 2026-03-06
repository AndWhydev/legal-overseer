import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { channelToolDefinitions, channelToolHandlers } from './tools/channel-tools'
import { composeCreatorStudioDeck } from '@/lib/creator-studio'
import { routeAgentAction } from './confidence-router'
import { queueAgentAction } from './approval-queue'
import { notifyApproval } from './approval-notifier'
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
  queued?: boolean
  approvalId?: string
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
      'Create a new task on the kanban board. Use this when the user asks to add a task, todo, or action item. If a contact is relevant, include their ID.',
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
        contact_id: {
          type: 'string',
          description: 'Contact UUID to link this task to (from search_contacts or entity context)',
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
    name: 'compose_creator_notification_mockup',
    description:
      'Compose a creator notification mockup payload (scene + notification stack) for UI rendering or content planning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        industry: { type: 'string', description: 'Industry context (e.g. content-creator, agency)' },
        carrier: { type: 'string', description: 'Top status bar carrier label' },
        clock: { type: 'string', description: 'Device clock text' },
        dateLabel: { type: 'string', description: 'Date label shown above the stack' },
        device: { type: 'string', enum: ['iphone', 'android'] },
        wallpaper: { type: 'string', enum: ['sunset-grid', 'night-wave', 'paper-grain', 'neon-city'] },
        hideSensitive: { type: 'boolean' },
        moduleOrder: {
          type: 'array',
          items: { type: 'string', enum: ['scene', 'notification-stack', 'appearance', 'privacy', 'export'] },
        },
        notifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              app: { type: 'string', enum: ['stripe', 'paypal', 'x', 'youtube', 'shopify', 'custom'] },
              amount: { type: 'string' },
              from: { type: 'string' },
              message: { type: 'string' },
              timeAgo: { type: 'string' },
            },
            required: ['app'],
          },
        },
      },
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

    // Enrich with entity graph data (relationships, timeline, memories, financial signals)
    const { assembleEntityBriefing } = await import('@/lib/context/assembler')
    const briefing = await assembleEntityBriefing(supabase, orgId, 'contact', contact.id)

    const enriched = {
      ...contact,
      entityContext: {
        relationships: briefing.relationships.slice(0, 10).map(r => ({
          type: r.relationshipType,
          entityType: r.entityType,
          entityId: r.entityId,
          strength: r.strength,
        })),
        recentEvents: briefing.timeline.slice(0, 5).map(e => ({
          type: e.eventType,
          date: e.occurredAt,
          channel: e.channelSource,
        })),
        memories: briefing.memories.slice(0, 5).map(m => ({
          content: m.content,
          confidence: m.confidence,
          category: m.category,
        })),
        financialSignals: briefing.crossReferences.financialSignals,
        activeTasks: briefing.crossReferences.relatedTasks.filter(
          t => t.status === 'pending' || t.status === 'in_progress'
        ),
        deadlines: briefing.crossReferences.deadlines,
      },
    }

    return { success: true, data: enriched }
  },

  async log_activity(input, orgId, supabase) {
    return logActivity(supabase, orgId, {
      action_type: input.action_type as string,
      action: input.action as string,
      reasoning: input.reasoning as string | undefined,
      result: input.result as string | undefined,
    })
  },

  async compose_creator_notification_mockup(input) {
    const notifications = Array.isArray(input.notifications)
      ? input.notifications.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : undefined

    const moduleOrder = Array.isArray(input.moduleOrder)
      ? input.moduleOrder.filter((item): item is string => typeof item === 'string')
      : undefined

    const deck = composeCreatorStudioDeck({
      industry: input.industry as string | undefined,
      carrier: input.carrier as string | undefined,
      clock: input.clock as string | undefined,
      dateLabel: input.dateLabel as string | undefined,
      device: input.device as 'iphone' | 'android' | undefined,
      wallpaper: input.wallpaper as 'sunset-grid' | 'night-wave' | 'paper-grain' | 'neon-city' | undefined,
      hideSensitive: input.hideSensitive as boolean | undefined,
      moduleOrder: moduleOrder as Array<'scene' | 'notification-stack' | 'appearance' | 'privacy' | 'export'> | undefined,
      notifications: notifications as Array<{
        id?: string
        app: 'stripe' | 'paypal' | 'x' | 'youtube' | 'shopify' | 'custom'
        amount?: string
        from?: string
        message?: string
        timeAgo?: string
      }> | undefined,
    })

    return { success: true, data: deck }
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
}

export function getAgentTools(): Anthropic.Tool[] {
  return [...toolDefinitions, ...channelToolDefinitions]
}

export interface ExecuteToolOptions {
  agentConfigId?: string
  agentConfig?: { confidence_thresholds?: { act?: number; ask?: number } }
  orgSettings?: { confidence_thresholds?: { act?: number; ask?: number } }
  confidenceScore?: number
  agentType?: string
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  options?: ExecuteToolOptions
): Promise<ToolResult> {
  const handler = allHandlers[name]
  if (!handler) {
    return { success: false, error: `Unknown tool: ${name}` }
  }

  // Apply confidence routing if confidence score is provided and approval infrastructure exists
  if (
    options?.confidenceScore !== undefined &&
    options?.agentConfigId &&
    options?.confidenceScore >= 0 &&
    options?.confidenceScore <= 1
  ) {
    const routing = routeAgentAction(
      options.confidenceScore,
      options.agentConfig,
      options.orgSettings,
      options.agentType
    )

    // If routing decision is 'ask' or 'escalate', queue for approval instead of executing
    if (routing.decision === 'ask' || routing.decision === 'escalate') {
      try {
        const approval = await queueAgentAction(supabase, {
          org_id: orgId,
          agent_config_id: options.agentConfigId,
          action_type: name,
          action_payload: input,
          action_summary: `Tool: ${name}`,
          confidence_score: options.confidenceScore,
          agentConfig: options.agentConfig,
          orgSettings: options.orgSettings,
        })

        if (approval) {
          // Trigger notification for the approval
          await notifyApproval(supabase, approval).catch(err => {
            console.warn(`[tools] notifyApproval failed for approval ${approval.id}:`, err)
          })
          return {
            success: true,
            queued: true,
            approvalId: approval.id,
            data: { routing: routing.decision, confidence: options.confidenceScore },
          }
        }
      } catch (err) {
        console.warn(`[tools] queueAgentAction failed:`, err)
        // Fall through to execution on approval queue failure (fail open)
      }
    }
  }

  try {
    return await handler(input, orgId, supabase)
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
