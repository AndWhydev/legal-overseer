import { logger } from '@/lib/core/logger'

const SENDBLUE_API_BASE = 'https://api.sendblue.co/api'

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

function getSendblueConfig() {
  const apiKey = process.env.SENDBLUE_API_KEY
  const apiSecret = process.env.SENDBLUE_API_SECRET
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER
  if (!apiKey || !apiSecret || !fromNumber) return null
  return { apiKey, apiSecret, fromNumber }
}

function sendblueHeaders(config: { apiKey: string; apiSecret: string }) {
  return {
    'Content-Type': 'application/json',
    'sb-api-key-id': config.apiKey,
    'sb-api-secret-key': config.apiSecret,
  }
}

/** Normalize phone number to E.164 format. */
export function normalizePhone(to: string): string {
  let normalized = to.replace(/[\s\-()]/g, '')
  if (!normalized.startsWith('+')) normalized = '+' + normalized
  if (normalized.startsWith('+04') && normalized.length === 11) {
    normalized = '+61' + normalized.slice(2)
  }
  return normalized
}

/**
 * Send a typing indicator (the "..." bubble) via Sendblue.
 * iMessage only — no-op for SMS recipients.
 */
export async function sendTypingIndicator(to: string): Promise<void> {
  const config = getSendblueConfig()
  if (!config) return

  try {
    await fetch(`${SENDBLUE_API_BASE}/send-typing-indicator`, {
      method: 'POST',
      headers: sendblueHeaders(config),
      body: JSON.stringify({
        number: normalizePhone(to),
        from_number: config.fromNumber,
      }),
    })
  } catch (err) {
    logger.debug('[sendblue] Typing indicator failed (non-fatal)', { err })
  }
}

/**
 * Send an iMessage via Sendblue API.
 */
export async function sendSendblueMessage(
  to: string,
  content: string,
  options?: { mediaUrl?: string },
): Promise<SendResult> {
  const config = getSendblueConfig()
  if (!config) {
    logger.error('[sendblue] Missing env vars (SENDBLUE_API_KEY, SENDBLUE_API_SECRET, SENDBLUE_FROM_NUMBER)')
    return { success: false, error: 'Sendblue not configured' }
  }

  const normalized = normalizePhone(to)

  const body: Record<string, string> = {
    number: normalized,
    from_number: config.fromNumber,
  }
  if (content) body.content = content.slice(0, 18996)
  if (options?.mediaUrl) body.media_url = options.mediaUrl

  try {
    const res = await fetch(`${SENDBLUE_API_BASE}/send-message`, {
      method: 'POST',
      headers: sendblueHeaders(config),
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (data.error_message) {
      logger.error('[sendblue] API error:', { detail: data.error_message })
      return { success: false, error: data.error_message }
    }

    logger.info('[sendblue] Message sent', {
      to: normalized,
      messageId: data.message_handle,
      status: data.status,
    })

    return { success: true, messageId: data.message_handle }
  } catch (err) {
    logger.error('[sendblue] Send failed:', err)
    return { success: false, error: String(err) }
  }
}

export function isSendblueConfigured(): boolean {
  return getSendblueConfig() !== null
}
