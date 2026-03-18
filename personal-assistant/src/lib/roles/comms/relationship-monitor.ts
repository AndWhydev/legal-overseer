import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommsHealthStatus = 'active' | 'cooling' | 'dormant'

export interface CommunicationFrequency {
  contactId: string
  contactName: string
  messagesPerWeek: number
  lastMessageAt: string
  totalMessages: number
  channels: string[]
  status: CommsHealthStatus
}

export interface EngagementDrop {
  contactId: string
  contactName: string
  previousRate: number   // messages/week (baseline)
  currentRate: number    // messages/week (recent)
  dropPercent: number    // percentage decrease
  status: CommsHealthStatus
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Messages per week thresholds for health status */
const HEALTH_THRESHOLDS = {
  active: 1.0,    // 1+ messages per week
  cooling: 0.25,  // 1 message per month
  dormant: 0,     // no messages in lookback period
} as const

/** Minimum drop percentage to flag as engagement drop */
const DROP_THRESHOLD_PERCENT = 50

// ---------------------------------------------------------------------------
// Communication Frequency Monitoring
// ---------------------------------------------------------------------------

/**
 * Track message frequency per client over the last 4 weeks.
 * Returns frequency data for all contacts with recent communications.
 */
export async function monitorCommunicationFrequency(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CommunicationFrequency[]> {
  const tag = `[relationship-monitor:${orgId.slice(0, 8)}]`
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

  // Get all messages in the last 4 weeks grouped by contact
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('id, channel, sender, received_at, metadata')
    .eq('org_id', orgId)
    .eq('processed', true)
    .gte('received_at', fourWeeksAgo)
    .order('received_at', { ascending: false })

  if (error || !messages) {
    logger.warn(`${tag} Could not fetch messages for frequency analysis: ${error?.message}`)
    return []
  }

  // Aggregate by contact
  const contactStats = new Map<string, {
    contactId: string
    contactName: string
    messageCount: number
    lastMessageAt: string
    channels: Set<string>
  }>()

  for (const msg of messages) {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    const contactId = meta.contact_id as string | undefined
    if (!contactId) continue

    const existing = contactStats.get(contactId)
    if (existing) {
      existing.messageCount++
      existing.channels.add(msg.channel as string)
    } else {
      contactStats.set(contactId, {
        contactId,
        contactName: (meta.contact_name as string) || (msg.sender as string) || 'Unknown',
        messageCount: 1,
        lastMessageAt: msg.received_at as string,
        channels: new Set([msg.channel as string]),
      })
    }
  }

  // Calculate weekly rate and health status
  const results: CommunicationFrequency[] = []
  const weeksInPeriod = 4

  for (const [, stats] of contactStats) {
    const messagesPerWeek = stats.messageCount / weeksInPeriod
    let status: CommsHealthStatus = 'dormant'

    if (messagesPerWeek >= HEALTH_THRESHOLDS.active) {
      status = 'active'
    } else if (messagesPerWeek >= HEALTH_THRESHOLDS.cooling) {
      status = 'cooling'
    }

    results.push({
      contactId: stats.contactId,
      contactName: stats.contactName,
      messagesPerWeek,
      lastMessageAt: stats.lastMessageAt,
      totalMessages: stats.messageCount,
      channels: Array.from(stats.channels),
      status,
    })
  }

  // Sort by status (dormant first for alerting), then by rate ascending
  const statusOrder: Record<CommsHealthStatus, number> = { dormant: 0, cooling: 1, active: 2 }
  results.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.messagesPerWeek - b.messagesPerWeek
  })

  return results
}

// ---------------------------------------------------------------------------
// Engagement Drop Detection
// ---------------------------------------------------------------------------

/**
 * Compare current communication rates against stored baselines.
 * Flags contacts where engagement has dropped significantly.
 */
export function detectEngagementDrops(
  current: CommunicationFrequency[],
  baselines: Record<string, { avgMessagesPerWeek: number; lastCalculated: string }>,
): EngagementDrop[] {
  const drops: EngagementDrop[] = []

  for (const freq of current) {
    const baseline = baselines[freq.contactId]
    if (!baseline) continue // No baseline yet -- skip (first time)

    // Only flag if baseline was meaningful (at least 0.5 msgs/week historically)
    if (baseline.avgMessagesPerWeek < 0.5) continue

    const dropPercent = Math.round(
      ((baseline.avgMessagesPerWeek - freq.messagesPerWeek) / baseline.avgMessagesPerWeek) * 100,
    )

    if (dropPercent >= DROP_THRESHOLD_PERCENT) {
      drops.push({
        contactId: freq.contactId,
        contactName: freq.contactName,
        previousRate: baseline.avgMessagesPerWeek,
        currentRate: freq.messagesPerWeek,
        dropPercent,
        status: freq.status,
      })
    }
  }

  // Also check for contacts in baselines that have NO current data (gone completely silent)
  for (const [contactId, baseline] of Object.entries(baselines)) {
    if (baseline.avgMessagesPerWeek < 0.5) continue

    const hasCurrent = current.find(f => f.contactId === contactId)
    if (!hasCurrent) {
      drops.push({
        contactId,
        contactName: `Contact ${contactId.slice(0, 8)}`,
        previousRate: baseline.avgMessagesPerWeek,
        currentRate: 0,
        dropPercent: 100,
        status: 'dormant',
      })
    }
  }

  // Sort by drop severity
  drops.sort((a, b) => b.dropPercent - a.dropPercent)

  return drops
}
