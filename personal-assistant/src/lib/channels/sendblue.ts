import { logger } from '@/lib/core/logger'

const SENDBLUE_API_URL = 'https://api.sendblue.co/api/send-message'

/**
 * Send an iMessage via Sendblue API.
 */
export async function sendSendblueMessage(
  to: string,
  content: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.SENDBLUE_API_KEY
  const apiSecret = process.env.SENDBLUE_API_SECRET
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER

  if (!apiKey || !apiSecret || !fromNumber) {
    logger.error('[sendblue] Missing env vars (SENDBLUE_API_KEY, SENDBLUE_API_SECRET, SENDBLUE_FROM_NUMBER)')
    return { success: false, error: 'Sendblue not configured' }
  }

  // Normalize to E.164
  let normalized = to.replace(/[\s\-()]/g, '')
  if (!normalized.startsWith('+')) normalized = '+' + normalized
  if (normalized.startsWith('+04') && normalized.length === 11) {
    normalized = '+61' + normalized.slice(2)
  }

  try {
    const res = await fetch(SENDBLUE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': apiKey,
        'sb-api-secret-key': apiSecret,
      },
      body: JSON.stringify({
        number: normalized,
        from_number: fromNumber,
        content: content.slice(0, 18996),
      }),
    })

    const data = await res.json()

    if (data.error_message) {
      logger.error('[sendblue] API error:', data.error_message)
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
  return !!(
    process.env.SENDBLUE_API_KEY &&
    process.env.SENDBLUE_API_SECRET &&
    process.env.SENDBLUE_FROM_NUMBER
  )
}
