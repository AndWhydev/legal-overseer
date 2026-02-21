import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import { classifyMessage, type ClassificationResult } from './classifier'

export type RoutingDecision = 'immediate' | 'queue' | 'batch' | 'skip'

export interface MessageRoute {
  decision: RoutingDecision
  reason: string
  targetAgent?: string
  priority: number
  batchWindow?: number // minutes
}

export interface RoutedMessage extends ChannelMessage {
  classification: ClassificationResult
  route: MessageRoute
}

/**
 * Pure, deterministic routing from classification result.
 */
export function routeMessage(classification: ClassificationResult): MessageRoute {
  const { significance, timeSensitivity, category, recommendedActions } = classification

  // Spam and newsletters always skip
  if (category === 'spam' || category === 'newsletter') {
    return {
      decision: 'skip',
      reason: `Category is ${category}`,
      priority: significance,
    }
  }

  // Low significance always skips
  if (significance < 4) {
    return {
      decision: 'skip',
      reason: `Low significance (${significance})`,
      priority: significance,
    }
  }

  // Determine target agent
  const targetAgent = resolveTargetAgent(category, recommendedActions)

  // High significance + immediate → immediate
  if (significance >= 8 && timeSensitivity === 'immediate') {
    return {
      decision: 'immediate',
      reason: `High significance (${significance}) with immediate time sensitivity`,
      targetAgent,
      priority: significance,
    }
  }

  // Significant + urgent → queue
  if (significance >= 6 && (timeSensitivity === 'immediate' || timeSensitivity === 'today')) {
    return {
      decision: 'queue',
      reason: `Significance ${significance} with ${timeSensitivity} sensitivity`,
      targetAgent,
      priority: significance,
    }
  }

  // Medium significance + near-term → batch 30min
  if (significance >= 4 && (timeSensitivity === 'today' || timeSensitivity === 'this_week')) {
    return {
      decision: 'batch',
      reason: `Significance ${significance} with ${timeSensitivity} sensitivity`,
      targetAgent,
      priority: significance,
      batchWindow: 30,
    }
  }

  // Medium significance + low urgency → batch 120min
  if (significance >= 4 && (timeSensitivity === 'whenever' || timeSensitivity === 'none')) {
    return {
      decision: 'batch',
      reason: `Significance ${significance} with ${timeSensitivity} sensitivity`,
      targetAgent,
      priority: significance,
      batchWindow: 120,
    }
  }

  // Fallback: skip
  return {
    decision: 'skip',
    reason: 'No routing rule matched',
    priority: significance,
  }
}

function resolveTargetAgent(
  category: ClassificationResult['category'],
  recommendedActions: string[],
): string | undefined {
  if (category === 'lead') return 'lead-swarm'

  if (category === 'client' && recommendedActions.some((a) => a.includes('invoice'))) {
    return 'invoice-flow'
  }

  if (recommendedActions.some((a) => /error|alert|incident/i.test(a))) {
    return 'sentry'
  }

  return undefined
}

/**
 * Classify and route a batch of messages.
 * Returns RoutedMessages sorted by priority DESC.
 */
export async function routeMessages(
  supabase: SupabaseClient,
  messages: ChannelMessage[],
  orgId: string,
): Promise<RoutedMessage[]> {
  const routed: RoutedMessage[] = []

  for (const message of messages) {
    const classification = await classifyMessage(supabase, message, orgId)
    const route = routeMessage(classification)
    routed.push({ ...message, classification, route })
  }

  // Mark messages as processed
  if (messages.length > 0) {
    const ids = messages.map((m) => m.id)
    await supabase
      .from('channel_messages')
      .update({ processed: true })
      .in('id', ids)
  }

  // Sort by priority descending
  routed.sort((a, b) => b.route.priority - a.route.priority)

  return routed
}
