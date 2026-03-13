import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { channelToolDefinitions, channelToolHandlers } from './tools/channel-tools'
import { superpowerToolDefinitions, superpowerToolHandlers } from './tools/superpower-tools'
import { composeCreatorStudioDeck } from '@/lib/creator-studio'
import { routeAgentAction } from './confidence-router'
import { queueAgentAction, getPendingApprovals, resolveApproval } from './approval-queue'
import { executeApprovedAction, requeueExpiredAction } from './action-executor'
import { notifyApproval } from './approval-notifier'
import { recordActionOutcome } from '@/lib/intelligence/confidence-calibrator'
import {
  createTask,
  updateTask,
  searchTasks,
  searchContacts,
  getContact,
  logActivity,
} from './shared-tools'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Tool Group metadata (for future Tool RAG via pgvector)
// ---------------------------------------------------------------------------

export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms'

export interface ToolGroupMeta {
  id: ToolGroup
  label: string
  description: string
  tools: string[]
}

export const TOOL_GROUPS: Record<ToolGroup, ToolGroupMeta> = {
  core: {
    id: 'core',
    label: 'Core Operations',
    description: 'Task management, contacts, activity logging, and creator tools',
    tools: ['create_task', 'update_task', 'search_tasks', 'search_contacts', 'get_contact', 'log_activity', 'compose_creator_notification_mockup'],
  },
  memory: {
    id: 'memory',
    label: 'Memory & Knowledge',
    description: 'Store and recall learned preferences, patterns, and context',
    tools: ['search_memory', 'add_memory'],
  },
  channel: {
    id: 'channel',
    label: 'Channel Integration',
    description: 'Sync, search, and interact with communication channels (Gmail, Calendar, etc.)',
    tools: ['sync_channels', 'search_messages', 'search_inbox', 'read_email', 'draft_reply', 'summarize_inbox', 'get_upcoming', 'create_reminder', 'schedule_event', 'read_recent_emails', 'search_emails', 'get_connected_channels', 'send_gmail'],
  },
  web: {
    id: 'web',
    label: 'Web & Research',
    description: 'Search the web and fetch URL content for research',
    tools: ['web_search', 'fetch_url', 'browse_website'],
  },
  comms: {
    id: 'comms',
    label: 'Outbound Communications',
    description: 'Send emails, SMS messages, and manage pending action approvals',
    tools: ['send_email', 'send_sms', 'send_whatsapp', 'approve_action'],
  },
}

/** Quick lookup: tool name → group. Derived from TOOL_GROUPS. */
export const TOOL_GROUP_MAP: Record<string, ToolGroup> = Object.fromEntries(
  Object.values(TOOL_GROUPS).flatMap(g => g.tools.map(t => [t, g.id]))
) as Record<string, ToolGroup>

/** Filter getAgentTools() by group. */
export function getToolsByGroup(group: ToolGroup): Anthropic.Tool[] {
  const toolNames = new Set(TOOL_GROUPS[group].tools)
  return getAgentTools().filter(t => toolNames.has(t.name))
}

// ---------------------------------------------------------------------------
// JIT Instructions (injected into tool_result content for point-of-use guidance)
// ---------------------------------------------------------------------------

export const JIT_INSTRUCTIONS: Record<string, string> = {
  // Web & Research
  web_search: 'Use these search results to answer the user\'s question. Cite sources with URLs when relevant. If results are insufficient, refine your search query and try again.',
  fetch_url: 'Use the extracted page content to answer the user\'s question. Summarize key points rather than dumping raw text. Note if the content was truncated.',
  browse_website: 'Use the extracted page content to answer the user\'s question. This content was rendered by a real browser, so JavaScript-generated content is included. If a screenshot was captured, describe what you see. Summarize key points rather than dumping raw text.',

  // Contacts
  search_contacts: 'Use the matched contact(s) to proceed with the user\'s request. If multiple matches exist, ask the user to clarify which one. Use the contact ID for subsequent tool calls.',
  get_contact: 'Use this contact profile to provide informed, contextual responses. Reference their recent activity, relationships, and financial signals when relevant. Do not recite the entire profile back.',

  // Tasks
  create_task: 'Task created successfully. Confirm the task title and column to the user. If they mentioned a deadline or contact, remind them if those weren\'t included.',
  update_task: 'Task updated. Briefly confirm what changed. If the task was moved to Done, ask if there are follow-up actions.',
  search_tasks: 'Present the matching tasks concisely. If the user is looking for a specific task to update, confirm which one before proceeding.',

  // Memory
  search_memory: 'Use recalled memories to inform your response. Do not quote memory entries verbatim — integrate the knowledge naturally.',
  add_memory: 'Memory stored. Do not announce this to the user unless they explicitly asked you to remember something.',

  // Channels
  sync_channels: 'Summarize what was found across channels. Highlight actionable items (emails needing replies, overdue reminders). Don\'t list every message.',
  search_messages: 'Present the most relevant messages first. Include sender, date, and a brief snippet. If the user is looking for something specific, highlight the best match.',
  search_inbox: 'Present the most relevant messages first. Include sender, subject, and preview. Use specific channel/category filters when available.',
  read_email: 'Display the full email content. Include sender, subject, body, and timestamp. Offer to draft a reply if relevant.',
  draft_reply: 'Draft created successfully and saved for review. Confirm the recipient, original message, and draft content. Remind user it requires approval before sending.',
  summarize_inbox: 'Present the digest in a readable format. Highlight the action items and most important messages. Group by category for clarity.',
  get_upcoming: 'Present the schedule in chronological order. Highlight overdue items and conflicts. Group by day if spanning multiple days.',
  create_reminder: 'Reminder created. Confirm the title, list, and due date to the user.',
  schedule_event: 'Event scheduled. Confirm the title, date/time, and location to the user.',
  send_gmail: 'Email sent from the user\'s Gmail account. Confirm the recipient, subject, and message ID. This was sent from their actual Gmail address, not a system address.',

  // Comms
  send_email: 'Email sent successfully. Confirm the recipient and subject to the user. Suggest logging this action if it\'s business-relevant.',
  send_sms: 'SMS sent successfully. Confirm the recipient to the user. Note if the message was split into multiple segments.',
  send_whatsapp: 'WhatsApp message queued for delivery via the bridge. Confirm the recipient and a preview of the message to the user. Note that delivery depends on the bridge being connected.',

  // Activity & Creative
  log_activity: 'Activity logged. Continue with the user\'s request — do not announce that you logged an action.',
  compose_creator_notification_mockup: 'Mockup generated. Present the key details and ask if the user wants to adjust any parameters.',

  // Approvals
  approve_action: 'Action has been approved and executed. Report the result to the user. If execution failed, explain the error and suggest next steps.',
}

/** Get JIT instruction for a tool, if one exists. */
export function getJITInstruction(toolName: string): string | undefined {
  return JIT_INSTRUCTIONS[toolName]
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

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
      'Create a new task on the kanban board. Use when the user wants to add a task, todo, or action item. Always include priority based on context. If a specific contact is mentioned, resolve them with search_contacts first to get their ID. Do NOT use this for reminders or calendar events — use create_reminder or schedule_event instead.',
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
    description: 'Update an existing task\'s title, description, status, priority, or column. Use when the user wants to change, move, complete, or archive a task. Requires the task_id — use search_tasks first if you don\'t have it.',
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
    description: 'Search tasks on the kanban board by keyword, status, or priority. Returns matching tasks with their IDs. Use this to find tasks before updating them, or to answer questions about what\'s on the board.',
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
      'Find contacts by name, alias, email, or phone number. Uses fuzzy entity resolution across all known aliases. Always use this before referencing a contact in other tools to get their correct ID.',
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
    description: 'Load a contact\'s full profile including communication history, relationships, financial signals, active tasks, and deadlines. Use after search_contacts when you need deep context about a specific person. Do NOT use this for simple lookups — search_contacts is faster.',
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
    description: 'Record an action to the activity feed for transparency. Log significant actions like emails sent, tasks created from channel messages, or research completed. Do NOT log routine tool calls — only meaningful business actions.',
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
    name: 'approve_action',
    description: 'Approve and execute a pending action from the approval queue. Use when the user confirms they want to proceed with a queued action (e.g. "yes send that email", "approve it", "go ahead"). You can reference the action by its short ID (shown in Pending Actions) or describe it. Also handles re-queuing expired actions from the last 7 days.',
    input_schema: {
      type: 'object' as const,
      properties: {
        approval_id: {
          type: 'string',
          description: 'The approval ID (full UUID or short 8-char prefix from the pending actions list)',
        },
        action_description: {
          type: 'string',
          description: 'Description of the action to approve (used for fuzzy matching if approval_id is not provided)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'search_memory',
    description: 'Search stored knowledge entries for previously learned patterns, preferences, and context. Use when the user references a past preference or when you need to recall how something was handled before.',
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
    description: 'Store a new knowledge entry to remember across sessions. Use for user preferences, recurring patterns, domain knowledge, and important context. Choose the most specific category. Do NOT store ephemeral information like today\'s weather or one-time requests.',
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

  async approve_action(input, orgId, supabase) {
    const approvalId = input.approval_id as string | undefined
    const actionDescription = input.action_description as string | undefined

    if (!approvalId && !actionDescription) {
      return { success: false, error: 'Provide either approval_id or action_description to identify the action' }
    }

    try {
      let matchedApproval: import('./approval-queue').ApprovalRecord | undefined

      if (approvalId) {
        // Direct lookup — support both full UUID and 8-char prefix
        const pending = await getPendingApprovals(supabase, orgId, { limit: 50 })
        matchedApproval = pending.find(a =>
          a.id === approvalId || a.id.startsWith(approvalId)
        )

        // Check expired approvals (last 7 days) if not found in pending
        if (!matchedApproval) {
          const { data: expired } = await supabase
            .from('approval_queue')
            .select('*, agent_configs(name)')
            .eq('org_id', orgId)
            .in('status', ['expired', 'auto_expired'])
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .or(`id.eq.${approvalId},id.like.${approvalId}%`)
            .limit(1)

          if (expired && expired.length > 0) {
            const expiredRecord = expired[0] as import('./approval-queue').ApprovalRecord
            const requeued = await requeueExpiredAction(supabase, expiredRecord)
            matchedApproval = requeued
          }
        }
      } else if (actionDescription) {
        // Fuzzy match on action_summary
        const pending = await getPendingApprovals(supabase, orgId, { limit: 50 })
        const descLower = actionDescription.toLowerCase()

        // Score each approval by how well it matches the description
        matchedApproval = pending.find(a =>
          a.action_summary.toLowerCase().includes(descLower) ||
          descLower.includes(a.action_summary.toLowerCase()) ||
          a.action_type.toLowerCase().includes(descLower)
        )

        // Broader fallback: word overlap scoring
        if (!matchedApproval && pending.length > 0) {
          const descWords = descLower.split(/\s+/).filter(w => w.length > 2)
          let bestScore = 0
          for (const a of pending) {
            const summaryLower = a.action_summary.toLowerCase()
            const score = descWords.filter(w => summaryLower.includes(w)).length
            if (score > bestScore) {
              bestScore = score
              matchedApproval = a
            }
          }
          // Require at least 1 word match
          if (bestScore === 0) matchedApproval = undefined
        }

        // Check expired approvals if nothing pending matches
        if (!matchedApproval) {
          const { data: expired } = await supabase
            .from('approval_queue')
            .select('*, agent_configs(name)')
            .eq('org_id', orgId)
            .in('status', ['expired', 'auto_expired'])
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .ilike('action_summary', `%${actionDescription}%`)
            .order('created_at', { ascending: false })
            .limit(1)

          if (expired && expired.length > 0) {
            const expiredRecord = expired[0] as import('./approval-queue').ApprovalRecord
            const requeued = await requeueExpiredAction(supabase, expiredRecord)
            matchedApproval = requeued
          }
        }
      }

      if (!matchedApproval) {
        return {
          success: false,
          error: approvalId
            ? `No pending or recently expired action found with ID "${approvalId}"`
            : `No pending action matching "${actionDescription}" found`,
        }
      }

      // Resolve the approval as approved via chat
      const resolved = await resolveApproval(
        supabase,
        matchedApproval.id,
        'approved',
        'chat-agent',
        'chat',
      )

      // Execute the approved action
      const result = await executeApprovedAction(supabase, resolved)

      return {
        success: result.success,
        data: {
          approvalId: resolved.id,
          actionType: resolved.action_type,
          actionSummary: resolved.action_summary,
          executionResult: result,
        },
        error: result.error,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      // Handle specific error codes from resolveApproval
      if (errorMsg === 'APPROVAL_NOT_FOUND') {
        return { success: false, error: 'Approval not found — it may have been deleted' }
      }
      if (errorMsg === 'APPROVAL_ALREADY_RESOLVED') {
        return { success: false, error: 'This action has already been resolved (approved, rejected, or expired)' }
      }

      logger.error('[approve_action] Error:', err)
      return { success: false, error: `Failed to approve action: ${errorMsg}` }
    }
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
  ...superpowerToolHandlers,
}

export function getAgentTools(groups?: ToolGroup[]): Anthropic.Tool[] {
  const allTools = [...toolDefinitions, ...channelToolDefinitions, ...superpowerToolDefinitions]
  if (!groups || groups.length === 0) return allTools

  const selectedGroups = new Set<ToolGroup>(['core', ...groups])
  const allowedTools = new Set<string>()
  for (const g of selectedGroups) {
    if (TOOL_GROUPS[g]) {
      for (const t of TOOL_GROUPS[g].tools) allowedTools.add(t)
    }
  }
  return allTools.filter(t => allowedTools.has(t.name))
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

    // Record auto-act outcomes for calibration (fire-and-forget)
    if (routing.decision === 'act' && options.agentType) {
      recordActionOutcome(
        supabase,
        orgId,
        options.agentType,
        name,
        options.confidenceScore,
        true, // auto-acted = implicitly approved
        null, // correctness unknown at execution time
        routing.thresholdSource ?? 'static',
      ).catch(() => { /* swallow */ })
    }

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
            logger.warn(`[tools] notifyApproval failed for approval ${approval.id}:`, { error: err })
          })
          return {
            success: true,
            queued: true,
            approvalId: approval.id,
            data: { routing: routing.decision, confidence: options.confidenceScore },
          }
        }
      } catch (err) {
        logger.warn(`[tools] queueAgentAction failed:`, { error: err })
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
