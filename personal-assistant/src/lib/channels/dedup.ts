import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from './types'

/**
 * Cross-channel message deduplication service.
 *
 * Two-tier dedup strategy:
 * 1. Fast external_id check (same channel, same message)
 * 2. Content-hash fallback (cross-channel, within 5-minute window)
 */

export interface DedupResult {
  duplicate: boolean
  matchType?: 'external_id' | 'content_hash'
}

/**
 * Compute a SHA-256 content hash for cross-channel deduplication.
 * Normalises sender, subject, and first 200 chars of body to lowercase/trimmed.
 */
export function computeContentHash(
  sender: string,
  subject: string | undefined,
  body: string
): string {
  const text = `${sender.toLowerCase().trim()}:${(subject || '').toLowerCase().trim()}:${body.slice(0, 200).toLowerCase().trim()}`
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Check if a message is a duplicate using two-tier strategy:
 * 1. Fast check: matching external_id + org_id + channel in channel_messages
 * 2. Cross-channel check: matching content_hash within 5-minute window across different channels
 */
export async function isDuplicate(
  supabase: SupabaseClient,
  orgId: string,
  msg: ChannelMessage
): Promise<DedupResult> {
  // Tier 1: Fast external_id check (same channel)
  const { data: extMatch } = await supabase
    .from('channel_messages')
    .select('id')
    .eq('org_id', orgId)
    .eq('channel', msg.channel)
    .eq('external_id', msg.externalId)
    .limit(1)

  if (extMatch && extMatch.length > 0) {
    return { duplicate: true, matchType: 'external_id' }
  }

  // Tier 2: Cross-channel content-hash check within 5-minute window
  const contentHash = computeContentHash(msg.sender, msg.subject, msg.body)
  const windowStart = new Date(msg.receivedAt.getTime() - 5 * 60 * 1000).toISOString()
  const windowEnd = new Date(msg.receivedAt.getTime() + 5 * 60 * 1000).toISOString()

  const { data: hashMatch } = await supabase
    .from('channel_messages')
    .select('id')
    .eq('org_id', orgId)
    .eq('content_hash', contentHash)
    .neq('channel', msg.channel)
    .gte('received_at', windowStart)
    .lte('received_at', windowEnd)
    .limit(1)

  if (hashMatch && hashMatch.length > 0) {
    return { duplicate: true, matchType: 'content_hash' }
  }

  return { duplicate: false }
}
