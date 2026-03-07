import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelAdapter, ChannelMessage } from './types'
import { getOrgCredential } from '@/lib/integrations/credentials'
import crypto from 'crypto'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstagramMessageResponse {
  messages?: Array<{ id?: string }>
  data?: Array<{ id?: string; name?: string }>
}

interface InstagramMessage {
  id: string
  from?: { id?: string; name?: string; username?: string }
  to?: Array<{ id?: string; name?: string; username?: string }>
  message?: string
  subject?: string
  timestamp?: number
  type?: string
  metadata?: Record<string, unknown>
}

interface InstagramConversation {
  id: string
  former_participants?: Array<{ id?: string; name?: string; username?: string }>
  participants?: Array<{ id?: string; name?: string; username?: string }>
  senders?: Array<{ id?: string; name?: string; username?: string }>
  updated_time?: string
  wallpaper?: string
}

interface GraphConversationsResponse {
  data?: InstagramConversation[]
  paging?: { cursors?: { before?: string; after?: string } }
}

interface GraphMessagesResponse {
  data?: InstagramMessage[]
  paging?: { cursors?: { before?: string; after?: string } }
}

export interface InstagramConfig {
  maxMessages?: number
  businessAccountId?: string
}

interface InstagramCredentials {
  access_token?: string
  token_expires_at?: string
  business_account_id?: string
}

export interface InstagramError {
  error: string
  details?: string
}

export interface InstagramWebhookEvent {
  entry?: Array<{
    id?: string
    messaging?: Array<{
      sender?: { id?: string }
      recipient?: { id?: string }
      timestamp?: number
      message?: { mid?: string; text?: string; subject?: string }
      postback?: { payload?: string }
    }>
  }>
  object?: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function getEnv() {
  return {
    businessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    verifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  }
}

function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true
  const bufferMs = 5 * 60 * 1000
  return new Date(expiresAt).getTime() - bufferMs <= Date.now()
}

async function refreshAccessToken(creds: InstagramCredentials): Promise<InstagramCredentials> {
  if (!creds.access_token) {
    throw new Error('No access token to refresh')
  }

  try {
    // Meta's long-lived token refresh endpoint
    const response = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
        creds.access_token,
      )}`,
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Instagram token refresh failed with status ${response.status}: ${text}`)
    }

    const data = (await response.json()) as {
      access_token?: string
      token_type?: string
      expires_in?: number
    }

    if (!data.access_token) {
      throw new Error('No new access token in refresh response')
    }

    // Calculate new expiration time (Meta returns expires_in in seconds)
    const expiresInSeconds = data.expires_in || 5184000 // Default 60 days
    const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

    return {
      ...creds,
      access_token: data.access_token,
      token_expires_at: newExpiresAt,
    }
  } catch (err) {
    logger.warn('[instagram] Token refresh failed:', err)
    throw new Error(`Failed to refresh Instagram token: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function resolveAccessToken(
  creds: InstagramCredentials,
  client?: SupabaseClient,
  orgId?: string,
): Promise<string> {
  if (creds.access_token && !isTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (creds.access_token) return creds.access_token

  throw new Error('No valid Instagram access token available')
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

async function graphFetch<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Instagram Graph API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Webhook validation
// ---------------------------------------------------------------------------

export function validateWebhookSignature(
  payload: string,
  signature: string,
  verifyToken: string,
): boolean {
  const hash = crypto
    .createHmac('sha256', verifyToken)
    .update(payload)
    .digest('hex')

  return `sha256=${hash}` === signature
}

export function validateWebhookChallenge(
  hubChallenge: string,
  hubVerifyToken: string,
  verifyToken: string,
): string | null {
  if (hubVerifyToken === verifyToken) {
    return hubChallenge
  }
  return null
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function sendMessageViaBridge(
  client: SupabaseClient,
  orgId: string,
  recipientId: string,
  text: string,
): Promise<string | null> {
  const { data: session } = await client
    .from('instagram_sessions')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .limit(1)
    .single()

  if (!session) {
    logger.warn('Instagram: no connected session for org', orgId)
    return null
  }

  const { data, error } = await client
    .from('instagram_outbox')
    .insert({
      org_id: orgId,
      session_id: session.id,
      recipient: recipientId,
      body: text,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    logger.warn('Instagram: failed to queue message', error.message)
    return null
  }

  return data?.id ?? null
}

export async function sendMessage(recipientId: string, text: string): Promise<string | null> {
  const env = getEnv()
  if (!env.businessAccountId || !env.accessToken) {
    logger.warn('Instagram not configured: missing INSTAGRAM_BUSINESS_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN')
    return null
  }

  try {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/${recipientId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      },
    )

    if (!response.ok) {
      logger.warn(`Instagram send failed with status ${response.status}`)
      return null
    }

    const payload = (await response.json()) as InstagramMessageResponse
    return payload.messages?.[0]?.id ?? null
  } catch (error) {
    logger.warn('Instagram send failed', error)
    return null
  }
}

export async function fetchInstagramMessages(
  client: SupabaseClient,
  orgId: string,
  config: InstagramConfig = {},
): Promise<ChannelMessage[] | InstagramError> {
  try {
    const creds = (await getOrgCredential(client, orgId, 'instagram')) as InstagramCredentials | null
    if (!creds) return { error: 'No Instagram credentials configured for this organization' }

    const token = await resolveAccessToken(creds, client, orgId)
    const businessAccountId = config.businessAccountId || creds.business_account_id || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
    const maxMessages = config.maxMessages || 50

    if (!businessAccountId) {
      return { error: 'No Instagram business account ID configured' }
    }

    // Fetch conversations
    const conversationsUrl = `https://graph.instagram.com/v21.0/${businessAccountId}/conversations?fields=id,participants,senders,former_participants,updated_time&limit=10`

    const conversationsData = await graphFetch<GraphConversationsResponse>(token, conversationsUrl)
    const conversations = conversationsData.data || []

    const messages: ChannelMessage[] = []

    // For each conversation, fetch messages
    for (const conv of conversations) {
      try {
        const messagesUrl = `https://graph.instagram.com/v21.0/${conv.id}/messages?fields=id,from,to,message,timestamp&limit=${maxMessages}`
        const msgData = await graphFetch<GraphMessagesResponse>(token, messagesUrl)

        for (const msg of msgData.data || []) {
          if (!msg.id || !msg.message) continue

          const senderName = msg.from?.name || msg.from?.username || msg.from?.id || 'Unknown'
          const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date()

          messages.push({
            id: `instagram-${msg.id}`,
            channel: 'instagram',
            externalId: conv.id,
            sender: senderName,
            senderEmail: undefined,
            subject: msg.type || 'Direct Message',
            body: (msg.message || '').slice(0, 2000).trim(),
            receivedAt: timestamp,
            isActionable: false,
            priority: 'medium',
            metadata: {
              messageId: msg.id,
              conversationId: conv.id,
              type: msg.type || 'text',
              from: msg.from?.id,
              to: msg.to?.[0]?.id,
              senderUsername: msg.from?.username,
            },
          })
        }
      } catch (err) {
        logger.warn(`Failed to fetch messages for conversation ${conv.id}:`, err)
        // Continue with next conversation
      }
    }

    return messages
  } catch (err) {
    return { error: 'Failed to fetch Instagram messages', details: String(err) }
  }
}

export async function handleWebhookEvent(
  event: InstagramWebhookEvent,
  client?: SupabaseClient,
  orgId?: string,
): Promise<ChannelMessage[]> {
  const messages: ChannelMessage[] = []

  if (!event.entry) return messages

  for (const entry of event.entry) {
    if (!entry.messaging) continue

    for (const msg of entry.messaging) {
      if (!msg.message || !msg.sender || !msg.recipient) continue
      if (!msg.message.text) continue // Skip messages without text

      const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date()

      messages.push({
        id: `instagram-${msg.message.mid || msg.sender.id}-${timestamp.getTime()}`,
        channel: 'instagram',
        externalId: msg.sender.id || 'unknown',
        sender: msg.sender.id || 'Unknown',
        subject: msg.message.subject || 'Direct Message',
        body: (msg.message.text || '').slice(0, 2000).trim(),
        receivedAt: timestamp,
        isActionable: false,
        priority: 'medium',
        metadata: {
          messageId: msg.message.mid,
          from: msg.sender.id,
          to: msg.recipient.id,
          timestamp: msg.timestamp,
        },
      })
    }
  }

  return messages
}

// ---------------------------------------------------------------------------
// Public API functions (env-var based)
// ---------------------------------------------------------------------------

export async function isInstagramAvailable(
  client?: SupabaseClient,
  orgId?: string,
): Promise<boolean> {
  // Check Supabase-backed session first
  if (client && orgId) {
    const { count } = await client
      .from('instagram_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'connected')

    if (count && count > 0) return true
  }

  // Fallback to env config
  const env = getEnv()
  return Boolean(env.businessAccountId && env.accessToken)
}

export const instagramAdapter: ChannelAdapter = {
  type: 'instagram',
  name: 'Instagram',
  description: 'Messaging via Instagram DMs and Graph API',
  icon: 'MessageCircle',

  async pull(_config, _since) {
    // Instagram is push-based via webhooks. Inbound handled by webhook POST.
    // Optionally implement polling via fetchInstagramMessages for missed messages.
    return []
  },

  async isAvailable() {
    return isInstagramAvailable()
  },
}
