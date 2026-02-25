import type { SupabaseClient } from '@supabase/supabase-js'
import { routeMessage, type RoutingDecision } from './action-router'

export interface TriageResult {
  processed: number
  actionable: number
  informational: number
  spam: number
  routed: { agent: string; messageId: string; priority: number }[]
}

export interface DigestEntry {
  category: string
  count: number
  highlights: string[]
}

/**
 * Triage all unprocessed channel messages for an org.
 * Classifies each, routes to appropriate agent, marks as processed.
 */
export async function runTriage(
  supabase: SupabaseClient,
  orgId: string
): Promise<TriageResult> {
  // Fetch unprocessed messages
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(100)

  if (error || !messages?.length) {
    return { processed: 0, actionable: 0, informational: 0, spam: 0, routed: [] }
  }

  const result: TriageResult = {
    processed: messages.length,
    actionable: 0,
    informational: 0,
    spam: 0,
    routed: [],
  }

  for (const msg of messages) {
    // Use existing classification if available, otherwise classify
    const classification = msg.classification || {
      significance: 5,
      category: 'general',
      timeSensitivity: 'this_week',
      recommendedActions: [],
    }

    const routing = routeMessage(classification)

    // Count by type
    if (routing.decision === 'skip') {
      result.spam++
    } else if (routing.decision === 'immediate' || routing.decision === 'queue') {
      result.actionable++
    } else {
      result.informational++
    }

    // Route to agent if actionable
    if (routing.decision !== 'skip' && routing.targetAgent) {
      result.routed.push({
        agent: routing.targetAgent,
        messageId: msg.id,
        priority: routing.priority,
      })
    }

    // Mark as processed
    await supabase
      .from('channel_messages')
      .update({
        processed: true,
        classification,
        processed_at: new Date().toISOString(),
      })
      .eq('id', msg.id)
  }

  return result
}

/**
 * Generate a daily digest of channel activity.
 */
export async function generateDigest(
  supabase: SupabaseClient,
  orgId: string,
  hoursBack: number = 24
): Promise<DigestEntry[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  const { data: messages } = await supabase
    .from('channel_messages')
    .select('channel_type, classification, body, sender_name')
    .eq('org_id', orgId)
    .gte('received_at', since)
    .order('received_at', { ascending: false })

  if (!messages?.length) {
    return [{ category: 'summary', count: 0, highlights: ['No new messages in the last 24 hours.'] }]
  }

  const categories: Record<string, { count: number; highlights: string[] }> = {}

  for (const msg of messages) {
    const cat = msg.classification?.category || 'uncategorized'
    if (!categories[cat]) categories[cat] = { count: 0, highlights: [] }
    categories[cat].count++
    if (categories[cat].highlights.length < 3) {
      const preview = (msg.body || '').slice(0, 80)
      categories[cat].highlights.push(`${msg.sender_name || 'Unknown'}: ${preview}`)
    }
  }

  return Object.entries(categories).map(([category, data]) => ({
    category,
    count: data.count,
    highlights: data.highlights,
  }))
}

export const channelTriage = {
  run: runTriage,
  generateDigest,
}
