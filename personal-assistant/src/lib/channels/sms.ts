import type { ChannelAdapter } from './types'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SMSOptions {
  maxRetries?: number
  retryDelayMs?: number
}

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface TelnyxWebhookPayload {
  data?: {
    event_type?: string
    payload?: {
      from?: { phone_number?: string }
      to?: Array<{ phone_number?: string }>
      text?: string
    }
  }
}

export interface InboundSMS {
  id: string
  from: string
  to: string
  text: string
  timestamp: Date
}

export interface TelnyxMessageResponse {
  data?: {
    id?: string
  }
  errors?: Array<{ detail?: string }>
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function getEnv() {
  return {
    apiKey: process.env.TELNYX_API_KEY,
    messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID,
    webhookSecret: process.env.TELNYX_WEBHOOK_SECRET,
  }
}

// ---------------------------------------------------------------------------
// Phone number normalization
// ---------------------------------------------------------------------------

/**
 * Normalize phone number to E.164 format (+61XXXXXXXXX for AU).
 * Accepts: 0412345678, +61412345678, 61412345678, +61 412 345 678, etc.
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode = '61'): string | null {
  if (!phone) return null

  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/\D/g, '')

  // Handle leading 0 (Australian domestic format)
  if (normalized.startsWith('0')) {
    normalized = defaultCountryCode + normalized.slice(1)
  }

  // Ensure country code prefix
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized
  }

  // Validate length (E.164: 1-15 digits after +)
  const digits = normalized.slice(1)
  if (digits.length < 7 || digits.length > 15) {
    return null
  }

  return normalized
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify Telnyx webhook signature using HMAC-SHA256.
 * Signature format: "v1=<hex_hash>"
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  const env = getEnv()
  if (!env.webhookSecret) return false

  try {
    const { createHmac } = await import('crypto')

    // Telnyx signs: timestamp.payload
    const baseString = `${timestamp}.${payload}`

    const hmac = createHmac('sha256', env.webhookSecret)
    hmac.update(baseString)
    const computedHash = hmac.digest('hex')

    // Parse signature (v1=<hash>)
    const [version, providedHash] = signature.split('=')
    if (version !== 'v1') return false

    return computedHash === providedHash
  } catch (err) {
    logger.warn('[sms] Webhook signature verification error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Webhook parsing
// ---------------------------------------------------------------------------

/**
 * Parse Telnyx inbound message webhook.
 */
export function receiveSMS(webhookPayload: TelnyxWebhookPayload): InboundSMS | null {
  if (!webhookPayload.data?.payload) {
    return null
  }

  const p = webhookPayload.data.payload
  if (!p.from?.phone_number || !p.to?.[0]?.phone_number || !p.text) {
    return null
  }

  return {
    id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    from: p.from.phone_number,
    to: p.to[0].phone_number,
    text: p.text.trim(),
    timestamp: new Date(),
  }
}

// ---------------------------------------------------------------------------
// SMS formatting
// ---------------------------------------------------------------------------

/**
 * Format content for SMS (plain text, no markdown, truncate to 160 char segments).
 * Returns up to 3 segments (480 chars) for multi-part messages.
 */
export function formatForSMS(content: string, maxSegments = 3): string {
  if (!content) return ''

  // Strip markdown: bold, italic, links, code blocks
  let text = content
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/__(.+?)__/g, '$1') // bold alt
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/_(.+?)_/g, '$1') // italic alt
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/#+\s+/g, '') // headings

  // Collapse multiple newlines
  text = text.replace(/\n\n+/g, '\n').trim()

  // Truncate to segments
  const segmentLength = 160
  const maxLength = segmentLength * maxSegments
  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 3) + '...'
  }

  return text
}

// ---------------------------------------------------------------------------
// Retry logic with exponential backoff
// ---------------------------------------------------------------------------

async function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 100,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Retry on 429 (rate limit) or 503 (service unavailable)
      if (response.status === 429 || response.status === 503) {
        if (attempt < maxRetries - 1) {
          const waitMs = initialDelayMs * Math.pow(2, attempt)
          logger.warn(
            `[sms] Rate limited (${response.status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`,
          )
          await delayMs(waitMs)
          continue
        }
      }

      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries - 1) {
        const waitMs = initialDelayMs * Math.pow(2, attempt)
        logger.warn(
          `[sms] Send failed, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message,
        )
        await delayMs(waitMs)
      }
    }
  }

  throw lastError || new Error('Failed to send SMS after retries')
}

// ---------------------------------------------------------------------------
// Send SMS
// ---------------------------------------------------------------------------

/**
 * Send SMS via Telnyx API.
 */
export async function sendSMS(
  to: string,
  body: string,
  options?: SMSOptions,
): Promise<SendResult> {
  const env = getEnv()
  if (!env.apiKey || !env.messagingProfileId) {
    logger.warn('[sms] SMS not configured: missing TELNYX_API_KEY or TELNYX_MESSAGING_PROFILE_ID')
    return {
      success: false,
      error: 'SMS not configured',
    }
  }

  // Normalize phone number
  const normalizedTo = normalizePhoneNumber(to)
  if (!normalizedTo) {
    return {
      success: false,
      error: 'Invalid phone number format',
    }
  }

  // Format body for SMS
  const formattedBody = formatForSMS(body, 3)
  if (!formattedBody) {
    return {
      success: false,
      error: 'Empty message body',
    }
  }

  try {
    const response = await sendWithRetry(
      'https://api.telnyx.com/v2/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.TELNYX_FROM_NUMBER || '+61412345678', // Default, should be set in env
          to: normalizedTo,
          text: formattedBody,
          messaging_profile_id: env.messagingProfileId,
        }),
      },
      options?.maxRetries ?? 3,
      options?.retryDelayMs ?? 100,
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.warn(`[sms] Send failed with status ${response.status}: ${errorText}`)
      return {
        success: false,
        error: `Telnyx API error: ${response.status}`,
      }
    }

    const data = (await response.json()) as TelnyxMessageResponse
    const messageId = data.data?.id

    if (!messageId) {
      logger.warn('[sms] No message ID in response')
      return {
        success: false,
        error: 'No message ID returned',
      }
    }

    return {
      success: true,
      messageId,
    }
  } catch (error) {
    logger.warn('[sms] Send failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility
// ---------------------------------------------------------------------------

export const smsAdapter: ChannelAdapter = {
  type: 'sms',
  name: 'SMS',
  description: 'Send and receive text messages via Telnyx',
  icon: 'MessageSquare',

  async pull() {
    // SMS is push-based via webhooks — no polling needed
    return []
  },

  async isAvailable() {
    const env = getEnv()
    return Boolean(env.apiKey && env.messagingProfileId && env.webhookSecret)
  },
}
