import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SLAThresholds {
  critical: number  // hours
  high: number
  medium: number
  low: number
}

export interface UnansweredThread {
  contactId: string
  contactName: string
  topic: string
  channel: string
  lastMessageAt: string
  lastMessagePreview: string
  hoursWaiting: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  suggestedAction: string
}

// ---------------------------------------------------------------------------
// Follow-Up Tracker
// ---------------------------------------------------------------------------

const DEFAULT_SLA: SLAThresholds = {
  critical: 2,
  high: 8,
  medium: 24,
  low: 72,
}

/**
 * Detect threads where the last message was from a contact (waiting on us)
 * and the response time exceeds the SLA threshold for that priority level.
 *
 * Uses entity_timeline events to determine who sent the last message.
 */
export async function detectUnansweredThreads(
  supabase: SupabaseClient,
  orgId: string,
  slaHours: Partial<SLAThresholds> = {},
): Promise<UnansweredThread[]> {
  const tag = `[follow-up-tracker:${orgId.slice(0, 8)}]`
  const sla = { ...DEFAULT_SLA, ...slaHours }

  // Look back far enough to catch the longest SLA (low = 72h)
  const lookbackMs = Math.max(sla.low, 72) * 60 * 60 * 1000
  const since = new Date(Date.now() - lookbackMs).toISOString()

  // Get recent inbound messages that are processed and have a contact linked
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('id, channel, sender, sender_email, subject, body, received_at, priority, metadata')
    .eq('org_id', orgId)
    .eq('processed', true)
    .gte('received_at', since)
    .order('received_at', { ascending: false })

  if (error || !messages) {
    logger.warn(`${tag} Could not fetch messages: ${error?.message}`)
    return []
  }

  // Group by contact, finding the latest inbound message per contact
  const contactLastInbound = new Map<string, {
    contactId: string
    contactName: string
    channel: string
    topic: string
    lastMessageAt: string
    lastMessagePreview: string
    priority: string
  }>()

  for (const msg of messages) {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    const contactId = meta.contact_id as string | undefined
    if (!contactId) continue

    // Only consider inbound messages (not our outbound)
    const direction = meta.direction as string | undefined
    if (direction === 'outbound') continue

    // Keep only the most recent per contact
    if (!contactLastInbound.has(contactId)) {
      contactLastInbound.set(contactId, {
        contactId,
        contactName: (meta.contact_name as string) || (msg.sender as string) || 'Unknown',
        channel: msg.channel as string,
        topic: (msg.subject as string) || 'General conversation',
        lastMessageAt: msg.received_at as string,
        lastMessagePreview: String(msg.body || '').slice(0, 200),
        priority: (msg.priority as string) || 'medium',
      })
    }
  }

  // For each contact with recent inbound, check if we've replied
  const unanswered: UnansweredThread[] = []

  for (const [contactId, thread] of contactLastInbound) {
    // Check entity_timeline for any outbound message to this contact after their last inbound
    const { data: outbound } = await supabase
      .from('entity_timeline')
      .select('occurred_at')
      .eq('org_id', orgId)
      .eq('entity_type', 'contact')
      .eq('entity_id', contactId)
      .eq('event_type', 'message_sent')
      .gte('occurred_at', thread.lastMessageAt)
      .limit(1)

    // If we've already replied, skip
    if (outbound && outbound.length > 0) continue

    // Calculate hours waiting
    const hoursWaiting = Math.round(
      (Date.now() - new Date(thread.lastMessageAt).getTime()) / (1000 * 60 * 60),
    )

    // Determine urgency based on priority and hours waiting
    let urgency: UnansweredThread['urgency'] = 'low'
    if (thread.priority === 'critical' || hoursWaiting >= sla.critical * 3) {
      urgency = 'critical'
    } else if (thread.priority === 'high' || hoursWaiting >= sla.high) {
      urgency = 'high'
    } else if (thread.priority === 'medium' || hoursWaiting >= sla.medium) {
      urgency = 'medium'
    }

    // Only surface if exceeding the SLA for the determined urgency level
    const threshold = sla[urgency]
    if (hoursWaiting < threshold) continue

    // Suggest action based on urgency
    let suggestedAction = 'Draft acknowledgment response'
    if (urgency === 'critical') {
      suggestedAction = 'Urgent: draft and send response immediately'
    } else if (urgency === 'high') {
      suggestedAction = 'Draft response with context and queue for review'
    }

    unanswered.push({
      contactId,
      contactName: thread.contactName,
      topic: thread.topic,
      channel: thread.channel,
      lastMessageAt: thread.lastMessageAt,
      lastMessagePreview: thread.lastMessagePreview,
      hoursWaiting,
      urgency,
      suggestedAction,
    })
  }

  // Sort by urgency (critical first) then by hours waiting (longest first)
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  unanswered.sort((a, b) => {
    const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (urgDiff !== 0) return urgDiff
    return b.hoursWaiting - a.hoursWaiting
  })

  return unanswered
}
