/**
 * Standing Orders — Persistent directives that apply across all conversations and agent actions.
 *
 * Users set these once; BitBit always follows them. Examples:
 * - "Always flag Steve's emails as high priority"
 * - "Never auto-reply to newsletters"
 * - "Summarize all financial emails in the daily digest"
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderCategory = 'triage' | 'communication' | 'financial' | 'scheduling' | 'general'

export interface StandingOrder {
  id: string
  org_id: string
  created_by: string
  directive: string
  category: OrderCategory
  is_active: boolean
  priority: number
  conditions: StandingOrderConditions
  created_at: string
  updated_at: string
}

export interface StandingOrderConditions {
  contact_name?: string
  contact_email?: string
  channel?: string
  subject_contains?: string
  sender_domain?: string
  [key: string]: unknown
}

export interface MessageContext {
  sender?: string
  senderEmail?: string
  channel?: string
  subject?: string
  body?: string
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active standing orders for an org, ordered by priority (highest first).
 */
export async function getActiveOrders(
  supabase: SupabaseClient,
  orgId: string,
): Promise<StandingOrder[]> {
  const { data, error } = await supabase
    .from('standing_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) {
    logger.error('[standing-orders] Failed to fetch active orders', { orgId, error: error.message })
    return []
  }

  return (data ?? []) as StandingOrder[]
}

// ─── Prompt Formatting ──────────────────────────────────────────────────────

/**
 * Format standing orders as a system prompt section.
 * Each order becomes a bullet: "- [category] directive text"
 */
export function formatOrdersForPrompt(orders: StandingOrder[]): string {
  if (orders.length === 0) return ''

  const lines = orders.map(o => {
    const conditionHints: string[] = []
    if (o.conditions.contact_name) conditionHints.push(`contact: ${o.conditions.contact_name}`)
    if (o.conditions.channel) conditionHints.push(`channel: ${o.conditions.channel}`)
    if (o.conditions.sender_domain) conditionHints.push(`domain: ${o.conditions.sender_domain}`)

    const suffix = conditionHints.length > 0 ? ` (${conditionHints.join(', ')})` : ''
    return `- [${o.category}] ${o.directive}${suffix}`
  })

  return `## Standing Orders

These are persistent directives set by the user. Always follow them.

${lines.join('\n')}`
}

// ─── Context Matching ───────────────────────────────────────────────────────

/**
 * Given a message context (sender, channel, subject), return which standing
 * orders are relevant based on their conditions field.
 *
 * Orders with no conditions always match (they are universal directives).
 * Orders with conditions only match when ALL specified conditions are met.
 */
export function matchOrdersToContext(
  orders: StandingOrder[],
  context: MessageContext,
): StandingOrder[] {
  return orders.filter(order => {
    const cond = order.conditions
    if (!cond || Object.keys(cond).length === 0) return true

    // All specified conditions must match (AND logic)
    if (cond.contact_name && context.sender) {
      if (!context.sender.toLowerCase().includes(cond.contact_name.toLowerCase())) {
        return false
      }
    } else if (cond.contact_name && !context.sender) {
      return false
    }

    if (cond.contact_email && context.senderEmail) {
      if (!context.senderEmail.toLowerCase().includes(cond.contact_email.toLowerCase())) {
        return false
      }
    } else if (cond.contact_email && !context.senderEmail) {
      return false
    }

    if (cond.channel && context.channel) {
      if (context.channel.toLowerCase() !== cond.channel.toLowerCase()) {
        return false
      }
    } else if (cond.channel && !context.channel) {
      return false
    }

    if (cond.subject_contains && context.subject) {
      if (!context.subject.toLowerCase().includes(cond.subject_contains.toLowerCase())) {
        return false
      }
    } else if (cond.subject_contains && !context.subject) {
      return false
    }

    if (cond.sender_domain && context.senderEmail) {
      const domain = context.senderEmail.split('@')[1]?.toLowerCase()
      if (!domain || !domain.includes(cond.sender_domain.toLowerCase())) {
        return false
      }
    } else if (cond.sender_domain && !context.senderEmail) {
      return false
    }

    return true
  })
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Create a new standing order.
 */
export async function createOrder(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  directive: string,
  category: OrderCategory,
  conditions?: StandingOrderConditions,
  priority?: number,
): Promise<StandingOrder | null> {
  const { data, error } = await supabase
    .from('standing_orders')
    .insert({
      org_id: orgId,
      created_by: userId,
      directive,
      category,
      conditions: conditions ?? {},
      priority: priority ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    logger.error('[standing-orders] Failed to create order', { orgId, error: error.message })
    return null
  }

  logger.info('[standing-orders] Created order', { orgId, id: data.id, category, directive })
  return data as StandingOrder
}

/**
 * Soft-deactivate a standing order (set is_active = false).
 */
export async function deactivateOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('standing_orders')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) {
    logger.error('[standing-orders] Failed to deactivate order', { orderId, error: error.message })
    return false
  }

  logger.info('[standing-orders] Deactivated order', { orderId })
  return true
}
