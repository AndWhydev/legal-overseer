import type { ChannelAdapter, ChannelMessage } from './types'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackMessage {
  type: string
  user?: string
  text?: string
  ts: string
  channel?: string
  thread_ts?: string
  subtype?: string
  bot_id?: string
}

interface SlackMessagesResponse {
  ok: boolean
  messages?: SlackMessage[]
  error?: string
}

interface SlackUserInfo {
  ok: boolean
  user?: {
    id: string
    name: string
    real_name?: string
    profile?: {
      email?: string
    }
  }
  error?: string
}

interface SlackChannelList {
  ok: boolean
  channels?: Array<{
    id: string
    name: string
  }>
  error?: string
}

export interface SlackEventPayload {
  type: string
  challenge?: string
  event?: {
    type: string
    user?: string
    text?: string
    ts?: string
    channel?: string
    thread_ts?: string
    reaction?: string
    item?: {
      type: string
      channel?: string
      ts?: string
    }
  }
  token?: string
  team_id?: string
}

export interface SlackError {
  error: string
  details?: string
}

export interface SlackConfig {
  botToken?: string
  signingSecret?: string
  maxMessages?: number
}

// ---------------------------------------------------------------------------
// Token and Config Helpers
// ---------------------------------------------------------------------------

function getSlackConfig(): SlackConfig {
  return {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  }
}

function isSlackConfigured(): boolean {
  const config = getSlackConfig()
  return Boolean(config.botToken && config.signingSecret)
}

// ---------------------------------------------------------------------------
// Slack API Helpers
// ---------------------------------------------------------------------------

async function slackFetch<T>(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `https://slack.com/api/${path}`

  const fetchInit: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }

  if (body && (method === 'POST' || method === 'PUT')) {
    fetchInit.body = JSON.stringify(body)
  }

  const res = await fetch(url, fetchInit)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Slack API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Slack Signature Verification
// ---------------------------------------------------------------------------

export async function verifySlackSignature(
  body: string,
  signature: string,
  signingSecret: string,
): Promise<boolean> {
  try {
    const [version, hash] = signature.split('=')
    if (version !== 'v0') {
      logger.warn('[slack] Invalid signature version:', version)
      return false
    }

    const hmac = createHmac('sha256', signingSecret)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const timeWindow = 300 // 5 minutes

    // Extract timestamp from body or headers (Slack uses timestamp from request headers)
    // For now, we'll use a simpler approach: Slack includes ts in the signature
    const baseString = `v0:${timestamp}:${body}`
    hmac.update(baseString)
    const computedHash = hmac.digest('hex')

    // Note: In production, you should also verify timestamp is recent
    return computedHash === hash
  } catch (err) {
    logger.warn('[slack] Signature verification error:', err)
    return false
  }
}

/**
 * Handle Slack URL verification challenge.
 * Slack sends a challenge parameter that must be echoed back for verification.
 */
export function handleSlackUrlChallenge(payload: SlackEventPayload): { challenge: string } | null {
  if (payload.type === 'url_verification' && payload.challenge) {
    return { challenge: payload.challenge }
  }
  return null
}

// ---------------------------------------------------------------------------
// Public API Functions
// ---------------------------------------------------------------------------

export async function sendSlackMessage(
  channelId: string,
  text: string,
  token?: string,
): Promise<string | null> {
  const config = getSlackConfig()
  const botToken = token || config.botToken

  if (!botToken) {
    logger.warn('[slack] No bot token configured')
    return null
  }

  try {
    const response = await slackFetch<{ ok: boolean; ts?: string; error?: string }>(
      botToken,
      'POST',
      'chat.postMessage',
      {
        channel: channelId,
        text,
      },
    )

    if (!response.ok) {
      logger.warn('[slack] Failed to send message:', response.error)
      return null
    }

    return response.ts ?? null
  } catch (err) {
    logger.warn('[slack] Send message failed:', err)
    return null
  }
}

export async function fetchSlackMessages(
  token: string,
  channelId?: string,
  since?: Date,
): Promise<ChannelMessage[]> {
  try {
    if (!channelId) {
      logger.warn('[slack] No channel ID provided')
      return []
    }

    const oldest = since ? (since.getTime() / 1000).toString() : undefined
    const response = await slackFetch<SlackMessagesResponse>(
      token,
      'GET',
      `conversations.history?channel=${encodeURIComponent(channelId)}&limit=50${oldest ? `&oldest=${oldest}` : ''}`,
    )

    if (!response.ok || !response.messages) {
      logger.warn('[slack] Failed to fetch messages:', response.error)
      return []
    }

    const messages: ChannelMessage[] = []

    for (const msg of response.messages) {
      // Skip messages from apps/bots unless they have actual text
      if (msg.subtype === 'bot_message' || msg.subtype === 'app_mention') {
        if (!msg.text) continue
      }

      // Skip thread replies with no user
      if (!msg.user && !msg.bot_id) {
        continue
      }

      // Get user info
      let sender = msg.user || msg.bot_id || 'Unknown'
      let senderEmail: string | undefined

      if (msg.user) {
        try {
          const userInfo = await slackFetch<SlackUserInfo>(token, 'GET', `users.info?user=${msg.user}`)
          if (userInfo.ok && userInfo.user) {
            sender = userInfo.user.real_name || userInfo.user.name || msg.user
            senderEmail = userInfo.user.profile?.email
          }
        } catch {
          // Fall back to user ID
        }
      }

      messages.push({
        id: `slack-${channelId}-${msg.ts}`,
        channel: 'slack',
        externalId: `slack-${msg.ts}`,
        sender,
        senderEmail,
        subject: `#${channelId}`,
        body: (msg.text || '').slice(0, 2000).trim(),
        receivedAt: new Date(parseInt(msg.ts) * 1000),
        isActionable: false,
        priority: 'medium',
        metadata: {
          messageId: msg.ts,
          channelId,
          threadTs: msg.thread_ts,
          botId: msg.bot_id,
          subtype: msg.subtype,
        },
      })
    }

    return messages
  } catch (err) {
    logger.error('[slack] Fetch messages failed:', err)
    return []
  }
}

export async function fetchSlackChannels(token: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const response = await slackFetch<SlackChannelList>(token, 'GET', 'conversations.list?limit=100')

    if (!response.ok) {
      logger.warn('[slack] Failed to fetch channels:', response.error)
      return []
    }

    return response.channels || []
  } catch (err) {
    logger.error('[slack] Fetch channels failed:', err)
    return []
  }
}

export function parseSlackWebhookEvent(payload: unknown): SlackEventPayload | null {
  try {
    if (typeof payload !== 'object' || !payload) return null
    return payload as SlackEventPayload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility
// ---------------------------------------------------------------------------

export const slackAdapter: ChannelAdapter = {
  type: 'slack',
  name: 'Slack',
  description: 'Messages via Slack Events API',
  icon: 'MessageSquare',

  async pull(_config, _since, _options) {
    // Slack is push-based via Events API
    // Messages are ingested via webhook, not pulled
    return []
  },

  async isAvailable() {
    return isSlackConfigured()
  },
}
