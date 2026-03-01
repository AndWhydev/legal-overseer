import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage, ChannelType } from './types'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import { asanaAdapter } from './asana'
import { calendlyAdapter } from './calendly'
import { stripeAdapter } from './stripe'

export interface PollResult {
  messagesFound: number
  messagesInserted: number
  deduplicated: number
  skipped: boolean
  error?: string
}

const adapterMap = {
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  asana: asanaAdapter,
  calendly: calendlyAdapter,
  stripe: stripeAdapter,
} as const

/**
 * Compute a SHA-256 content hash for cross-channel deduplication.
 */
function computeContentHash(msg: ChannelMessage): string {
  const text = `${msg.sender}:${msg.subject || ''}:${msg.body.slice(0, 200)}`
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Check if a message with matching content_hash already exists within a 5-minute window.
 */
async function isDuplicateByContentHash(
  supabase: SupabaseClient,
  orgId: string,
  contentHash: string,
  receivedAt: Date
): Promise<boolean> {
  const windowStart = new Date(receivedAt.getTime() - 5 * 60 * 1000).toISOString()
  const windowEnd = new Date(receivedAt.getTime() + 5 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('channel_messages')
    .select('id')
    .eq('org_id', orgId)
    .eq('content_hash', contentHash)
    .gte('received_at', windowStart)
    .lte('received_at', windowEnd)
    .limit(1)

  return (data?.length ?? 0) > 0
}

/**
 * Poll a channel for new messages and persist them to channel_messages.
 * Never throws -- returns errors in PollResult.error.
 */
export async function pollChannel(
  supabase: SupabaseClient,
  orgId: string,
  channelType: ChannelType
): Promise<PollResult> {
  try {
    // Read channel_connections row
    const { data: conn, error: connErr } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('org_id', orgId)
      .eq('channel_type', channelType)
      .single()

    if (connErr || !conn) {
      return { messagesFound: 0, messagesInserted: 0, deduplicated: 0, skipped: true, error: connErr?.message || 'No connection found' }
    }

    if (!conn.relay_enabled) {
      return { messagesFound: 0, messagesInserted: 0, deduplicated: 0, skipped: true }
    }

    const adapter = adapterMap[channelType as keyof typeof adapterMap]
    if (!adapter) {
      return { messagesFound: 0, messagesInserted: 0, deduplicated: 0, skipped: true, error: `No adapter for channel: ${channelType}` }
    }

    // Pull messages since poll_cursor
    const since = conn.poll_cursor ? new Date(conn.poll_cursor) : undefined
    const messages = await adapter.pull(conn.config || {}, since)

    if (messages.length === 0) {
      return { messagesFound: 0, messagesInserted: 0, deduplicated: 0, skipped: false }
    }

    // Upsert each message (idempotent via ON CONFLICT DO NOTHING)
    let inserted = 0
    let deduplicated = 0
    for (const msg of messages) {
      const contentHash = computeContentHash(msg)

      // Cross-channel dedup: check for matching content within 5-minute window
      const isDuplicate = await isDuplicateByContentHash(supabase, orgId, contentHash, msg.receivedAt)
      if (isDuplicate) {
        deduplicated++
        continue
      }

      const { error: upsertErr } = await supabase
        .from('channel_messages')
        .upsert(
          {
            org_id: orgId,
            channel: msg.channel,
            external_id: msg.externalId,
            sender: msg.sender,
            sender_email: msg.senderEmail || null,
            subject: msg.subject || null,
            body: msg.body,
            received_at: msg.receivedAt.toISOString(),
            is_actionable: msg.isActionable,
            priority: msg.priority,
            processed: false,
            metadata: msg.metadata,
            content_hash: contentHash,
          },
          { onConflict: 'org_id,channel,external_id', ignoreDuplicates: true }
        )

      if (!upsertErr) {
        inserted++
      }
    }

    // Update poll_cursor to latest message receivedAt
    const latestDate = messages.reduce(
      (max, m) => (m.receivedAt > max ? m.receivedAt : max),
      messages[0].receivedAt
    )

    await supabase
      .from('channel_connections')
      .update({
        poll_cursor: latestDate.toISOString(),
        last_sync: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('channel_type', channelType)

    return { messagesFound: messages.length, messagesInserted: inserted, deduplicated, skipped: false }
  } catch (err) {
    return {
      messagesFound: 0,
      messagesInserted: 0,
      deduplicated: 0,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Fetch unprocessed messages for an org (for classification pipeline).
 */
export async function processNewMessages(
  supabase: SupabaseClient,
  orgId: string
): Promise<ChannelMessage[]> {
  const { data, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(50)

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    channel: row.channel as ChannelType,
    externalId: row.external_id as string,
    sender: row.sender as string,
    senderEmail: (row.sender_email as string) || undefined,
    subject: (row.subject as string) || undefined,
    body: row.body as string,
    receivedAt: new Date(row.received_at as string),
    isActionable: row.is_actionable as boolean,
    priority: row.priority as ChannelMessage['priority'],
    metadata: (row.metadata as Record<string, unknown>) || {},
  }))
}
