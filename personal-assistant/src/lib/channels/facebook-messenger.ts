import type { ChannelAdapter, ChannelMessage } from './types'

/**
 * Facebook Messenger Graph API response for sending a message
 */
interface FacebookMessageResponse {
  message_id?: string
  recipient_id?: string
  error?: {
    message: string
    code: number
  }
}

/**
 * Represents a Facebook Messenger conversation/thread
 */
export interface FacebookConversation {
  id: string
  name?: string
  sn?: string
  participants?: Array<{ email?: string; name?: string }>
  updated_time?: string
}

/**
 * Facebook Messenger event from webhook
 */
export interface FacebookMessageEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text?: string
    attachments?: Array<{
      type: string
      payload?: {
        url?: string
        title?: string
      }
    }>
    quick_reply?: { payload: string }
  }
}

/**
 * Webhook payload structure from Facebook
 */
export interface FacebookWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    messaging: FacebookMessageEvent[]
  }>
}

function getEnv() {
  return {
    pageAccessToken: process.env.FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN,
    verifyToken: process.env.FACEBOOK_MESSENGER_VERIFY_TOKEN,
    businessAccountId: process.env.FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID,
  }
}

/**
 * Send a text message via Facebook Messenger Graph API
 */
export async function sendMessage(to: string, text: string): Promise<string | null> {
  const env = getEnv()
  if (!env.pageAccessToken) {
    logger.warn(
      'Facebook Messenger not configured: missing FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN',
    )
    return null
  }

  try {
    const response = await fetch('https://graph.instagram.com/v19.0/me/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: to },
        messaging_type: 'RESPONSE',
        message: { text },
        access_token: env.pageAccessToken,
      }),
    })

    if (!response.ok) {
      logger.warn(`Facebook Messenger send failed with status ${response.status}`)
      return null
    }

    const payload = (await response.json()) as FacebookMessageResponse
    if (payload.error) {
      logger.warn(`Facebook Messenger API error: ${payload.error.message}`)
      return null
    }

    return payload.message_id ?? null
  } catch (error) {
    logger.warn('Facebook Messenger send failed', error)
    return null
  }
}

/**
 * Send a structured message with quick replies
 */
export async function sendMessageWithQuickReplies(
  to: string,
  text: string,
  quickReplies: Array<{ title: string; payload: string }>,
): Promise<string | null> {
  const env = getEnv()
  if (!env.pageAccessToken) {
    logger.warn('Facebook Messenger not configured: missing page access token')
    return null
  }

  try {
    const response = await fetch('https://graph.instagram.com/v19.0/me/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: to },
        messaging_type: 'RESPONSE',
        message: {
          text,
          quick_replies: quickReplies.map((qr) => ({
            content_type: 'text',
            title: qr.title,
            payload: qr.payload,
          })),
        },
        access_token: env.pageAccessToken,
      }),
    })

    if (!response.ok) {
      logger.warn(`Facebook Messenger send failed with status ${response.status}`)
      return null
    }

    const payload = (await response.json()) as FacebookMessageResponse
    return payload.message_id ?? null
  } catch (error) {
    logger.warn('Facebook Messenger send with quick replies failed', error)
    return null
  }
}

/**
 * Verify webhook signature (called on GET request from Facebook)
 * Returns challenge string if valid token, null otherwise
 */
export function verifyWebhook(
  token: string,
  mode: string,
  challenge: string,
): string | null {
  const env = getEnv()
  if (!env.verifyToken) {
    logger.warn('Facebook Messenger not configured: missing FACEBOOK_MESSENGER_VERIFY_TOKEN')
    return null
  }

  if (mode !== 'subscribe') {
    logger.warn('Facebook Messenger webhook: invalid mode', mode)
    return null
  }

  if (token !== env.verifyToken) {
    logger.warn('Facebook Messenger webhook: invalid verify token')
    return null
  }

  return challenge
}

/**
 * Parse an incoming webhook event from Facebook Messenger
 * Returns array of ChannelMessage objects
 */
export function parseWebhookEvent(payload: FacebookWebhookPayload): ChannelMessage[] {
  const messages: ChannelMessage[] = []

  if (payload.object !== 'page') {
    logger.warn('Facebook Messenger webhook: not a page object')
    return []
  }

  for (const entry of payload.entry || []) {
    for (const messaging of entry.messaging || []) {
      if (!messaging.message) continue

      const msg = messaging.message
      if (!msg.text && (!msg.attachments || msg.attachments.length === 0)) {
        continue
      }

      const senderId = messaging.sender.id
      const attachmentText = msg.attachments
        ?.map((att) => `[${att.type.toUpperCase()}] ${att.payload?.title || att.payload?.url || ''}`)
        .join('\n')
      const body = msg.text
        ? attachmentText
          ? `${msg.text}\n\n${attachmentText}`
          : msg.text
        : attachmentText || '[No content]'

      messages.push({
        id: `fb-${msg.mid}`,
        channel: 'facebook',
        externalId: `fb-${senderId}-${msg.mid}`,
        sender: senderId,
        senderEmail: undefined,
        body,
        receivedAt: new Date(messaging.timestamp),
        isActionable: msg.text ? msg.text.length > 0 : false,
        priority: 'medium',
        metadata: {
          mid: msg.mid,
          senderId,
          recipientId: messaging.recipient.id,
          attachmentCount: msg.attachments?.length ?? 0,
        },
      })
    }
  }

  return messages
}

/**
 * Get conversations for a given page or business account
 */
export async function getConversations(): Promise<FacebookConversation[]> {
  const env = getEnv()
  if (!env.pageAccessToken || !env.businessAccountId) {
    logger.warn(
      'Facebook Messenger not configured: missing page access token or business account ID',
    )
    return []
  }

  try {
    const response = await fetch(
      `https://graph.instagram.com/v19.0/${env.businessAccountId}/conversations`,
      {
        headers: {
          Authorization: `Bearer ${env.pageAccessToken}`,
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      logger.warn(`Facebook Messenger conversations fetch failed with status ${response.status}`)
      return []
    }

    const data = (await response.json()) as { data: FacebookConversation[] }
    return data.data || []
  } catch (error) {
    logger.warn('Facebook Messenger get conversations failed', error)
    return []
  }
}

export function getFacebookMessengerConfig() {
  return getEnv()
}

/**
 * Check if Facebook Messenger is configured and available
 */
export async function isAvailable(): Promise<boolean> {
  const env = getEnv()
  return Boolean(env.pageAccessToken && env.verifyToken)
}

/**
 * ChannelAdapter implementation for Facebook Messenger
 * Supports both pull (polling conversations) and webhook push (via verifyWebhook/parseWebhookEvent)
 */
export const facebookMessengerAdapter: ChannelAdapter = {
  type: 'facebook',
  name: 'Facebook Messenger',
  description: 'Messaging via Facebook Messenger (Meta Graph API)',
  icon: 'MessageCircle',

  async pull() {
    // Facebook Messenger is primarily push-based via webhooks
    // Can optionally fetch recent conversations here if needed
    const conversations = await getConversations()
    // For now, return empty array as messages come via webhooks
    // In the future, could implement conversation polling if needed
    return []
  },

  async isAvailable() {
    return isAvailable()
  },
}
