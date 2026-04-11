import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export const standingOrderToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'list_standing_orders',
    description: 'List active standing orders (persistent rules BitBit always follows). Use when the user asks about their rules, preferences, or automation directives.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_inactive: { type: 'boolean', description: 'Include disabled orders too. Default: false.' },
      },
      required: [],
    },
  },
  {
    name: 'create_standing_order',
    description: 'Create a new standing order — a persistent rule BitBit will always follow. Use when the user says "always", "never", "whenever", or defines a recurring behavior. Examples: "Always flag Steve emails as high priority", "Never auto-reply to newsletters", "When a client hasn\'t responded in 5 days, draft a follow-up".',
    input_schema: {
      type: 'object' as const,
      properties: {
        directive: { type: 'string', description: 'The rule in plain language. Be specific.' },
        category: { type: 'string', enum: ['triage', 'communication', 'financial', 'scheduling', 'general'] },
        conditions: {
          type: 'object',
          description: 'Optional conditions: contact_name, contact_email, channel, subject_contains, sender_domain',
        },
        priority: { type: 'number', description: 'Priority 1-10 (higher = checked first). Default: 5.' },
      },
      required: ['directive', 'category'],
    },
  },
  {
    name: 'update_standing_order',
    description: 'Enable, disable, or modify a standing order. Use when the user wants to change or turn off a rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        directive_match: { type: 'string', description: 'Partial text match of the directive to find.' },
        is_active: { type: 'boolean', description: 'Enable or disable the order.' },
        new_directive: { type: 'string', description: 'Optional: replace the directive text.' },
      },
      required: ['directive_match'],
    },
  },
]

type ToolResult = { success: boolean; data?: unknown; error?: string }

async function handleListStandingOrders(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  let query = supabase
    .from('standing_orders')
    .select('id, directive, category, is_active, priority, conditions, created_at')
    .eq('org_id', orgId)
    .order('priority', { ascending: false })

  if (!input.include_inactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query.limit(20)
  if (error) return { success: false, error: error.message }

  return { success: true, data: { orders: data ?? [], count: (data ?? []).length } }
}

async function handleCreateStandingOrder(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const directive = input.directive as string
  if (!directive) return { success: false, error: 'directive is required' }

  const { data, error } = await supabase
    .from('standing_orders')
    .insert({
      org_id: orgId,
      created_by: '02ce2616-c01b-45a5-a2ad-16ebe936a6b2',
      directive,
      category: input.category || 'general',
      conditions: input.conditions || {},
      priority: input.priority || 5,
      is_active: true,
    })
    .select('id, directive')
    .single()

  if (error) return { success: false, error: error.message }

  logger.info('[standing-orders] Order created', { id: data.id, directive })
  return { success: true, data: { id: data.id, directive: data.directive } }
}

async function handleUpdateStandingOrder(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const match = input.directive_match as string
  if (!match) return { success: false, error: 'directive_match is required' }

  const { data: orders } = await supabase
    .from('standing_orders')
    .select('id, directive')
    .eq('org_id', orgId)
    .ilike('directive', `%${match}%`)
    .limit(1)

  if (!orders || orders.length === 0) {
    return { success: false, error: `No standing order matching ${match} found` }
  }

  const order = orders[0]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes: string[] = []

  if (input.is_active !== undefined) {
    update.is_active = input.is_active
    changes.push(input.is_active ? 'enabled' : 'disabled')
  }
  if (input.new_directive) {
    update.directive = input.new_directive
    changes.push(`updated to: ${input.new_directive}`)
  }

  const { error } = await supabase
    .from('standing_orders')
    .update(update)
    .eq('id', order.id)

  if (error) return { success: false, error: error.message }

  logger.info('[standing-orders] Order updated', { id: order.id, changes })
  return { success: true, data: { id: order.id, directive: order.directive, changes } }
}

export const standingOrderToolHandlers: Record<
  string,
  (input: Record<string, unknown>, orgId: string, supabase: SupabaseClient) => Promise<ToolResult>
> = {
  list_standing_orders: handleListStandingOrders,
  create_standing_order: handleCreateStandingOrder,
  update_standing_order: handleUpdateStandingOrder,
}
