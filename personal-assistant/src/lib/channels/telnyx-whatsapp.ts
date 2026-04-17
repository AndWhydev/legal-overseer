/**
 * Telnyx WhatsApp Provider
 *
 * Telnyx is the BSP (Business Solution Provider) for the BitBit WhatsApp number.
 * All inbound webhooks arrive in Telnyx's envelope format (not Meta's), and all
 * outbound messages go through Telnyx's API (not Meta's Graph API).
 *
 * Endpoints:
 *   Send:     POST https://api.telnyx.com/v2/messages/whatsapp
 *   Media DL: GET  https://api.telnyx.com/v2/media/{media_id}
 */

import { logger } from '@/lib/core/logger'
import { assertOutboundAllowed, OutboundBlockedError } from './guards'

const TELNYX_BASE = 'https://api.telnyx.com/v2'

export interface TelnyxSendResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Normalize a WhatsApp phone number to E.164 with leading +.
 * Telnyx WhatsApp API expects: +15559508434 (not 15559508434, not wa_id).
 */
export function normalizeWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  return '+' + digits
}

// ── Send ────────────────────────────────────────────────────────────────────

/**
 * Send a text WhatsApp message via Telnyx.
 */
export async function sendTelnyxWhatsApp(
  to: string,
  text: string,
): Promise<TelnyxSendResult> {
  const apiKey = process.env.TELNYX_API_KEY
  const fromNumber = process.env.TELNYX_WHATSAPP_FROM_NUMBER
  const messagingProfileId = process.env.TELNYX_WHATSAPP_MESSAGING_PROFILE_ID

  if (!apiKey) {
    logger.warn('[telnyx-whatsapp] Missing TELNYX_API_KEY')
    return { success: false, error: 'Not configured' }
  }
  if (!fromNumber) {
    logger.warn('[telnyx-whatsapp] Missing TELNYX_WHATSAPP_FROM_NUMBER')
    return { success: false, error: 'Not configured' }
  }

  const normalizedTo = normalizeWhatsAppNumber(to)
  const normalizedFrom = normalizeWhatsAppNumber(fromNumber)

  try {
    assertOutboundAllowed(normalizedTo, 'whatsapp')
  } catch (err) {
    if (err instanceof OutboundBlockedError) {
      if (err.reason === 'dry-run') {
        return { success: true, messageId: `dry-run-${Date.now()}` }
      }
      return { success: false, error: err.message }
    }
    throw err
  }

  try {
    const body: Record<string, unknown> = {
      from: normalizedFrom,
      to: normalizedTo,
      whatsapp_message: {
        type: 'text',
        text: { body: text },
      },
    }
    if (messagingProfileId) body.messaging_profile_id = messagingProfileId

    const response = await fetch(`${TELNYX_BASE}/messages/whatsapp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.warn(`[telnyx-whatsapp] Send failed with status ${response.status}: ${errorText}`)
      return { success: false, error: `Telnyx API error: ${response.status}` }
    }

    const data = (await response.json()) as { data?: { id?: string } }
    const messageId = data.data?.id
    if (!messageId) {
      return { success: false, error: 'No message ID returned' }
    }

    return { success: true, messageId }
  } catch (err) {
    logger.warn('[telnyx-whatsapp] Send failed', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Mark an inbound WhatsApp message as read (blue ticks).
 * Telnyx exposes this through /v2/messages/whatsapp/mark_as_read.
 */
export async function markWhatsAppRead(messageId: string): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey || !messageId) return

  try {
    await fetch(`${TELNYX_BASE}/messages/whatsapp/mark_as_read`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message_id: messageId }),
    })
  } catch {
    // Non-fatal — best-effort read receipt
  }
}

/**
 * Download a Telnyx-hosted media file (for inbound voice notes, images).
 * Inbound media URLs in webhooks are pre-signed and can be fetched directly.
 */
export async function downloadTelnyxMedia(mediaUrl: string): Promise<{
  buffer: Buffer
  mimeType: string
} | null> {
  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) {
      logger.warn('[telnyx-whatsapp] Media download failed:', response.status)
      return null
    }
    const mimeType = response.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await response.arrayBuffer()
    return { buffer: Buffer.from(arrayBuffer), mimeType }
  } catch (err) {
    logger.warn('[telnyx-whatsapp] Media download error', err)
    return null
  }
}

// ── Webhook Payload Types ───────────────────────────────────────────────────

/**
 * Telnyx WhatsApp inbound webhook envelope.
 * Wraps the standard Telnyx `data.event_type` structure.
 */
export interface TelnyxWhatsAppWebhook {
  data?: {
    event_type?: string
    id?: string
    occurred_at?: string
    payload?: TelnyxWhatsAppPayload
  }
}

export interface TelnyxWhatsAppPayload {
  id?: string
  from?: { phone_number?: string; profile_name?: string }
  to?: Array<{ phone_number?: string }>
  messaging_profile_id?: string
  whatsapp?: {
    waba_id?: string
    phone_number_id?: string
  }
  // Text message
  text?: string | { body?: string }
  // Media messages
  media?: Array<{
    url?: string
    content_type?: string
    media_id?: string
    caption?: string
  }>
  // Some payload variants nest the content under whatsapp_message
  whatsapp_message?: {
    type?: string
    text?: { body?: string }
    image?: { url?: string; caption?: string; mime_type?: string; id?: string }
    audio?: { url?: string; mime_type?: string; id?: string }
    document?: { url?: string; filename?: string; mime_type?: string; id?: string }
  }
}

export interface ParsedInboundWhatsApp {
  messageId: string
  from: string
  fromName?: string
  to: string
  text: string
  mediaUrl?: string
  mediaMime?: string
  mediaKind?: 'audio' | 'image' | 'document' | 'other'
}

/**
 * Parse a Telnyx WhatsApp inbound webhook into a normalized shape.
 * Returns null if the payload isn't a recognized inbound message.
 */
export function parseInboundWhatsApp(
  webhook: TelnyxWhatsAppWebhook,
): ParsedInboundWhatsApp | null {
  const payload = webhook.data?.payload
  if (!payload) return null

  const from = payload.from?.phone_number
  const to = payload.to?.[0]?.phone_number
  if (!from || !to) return null

  const messageId = payload.id || webhook.data?.id || `wa-${Date.now()}`
  const fromName = payload.from?.profile_name

  // Text (flat or nested in whatsapp_message.text.body)
  let text = ''
  if (typeof payload.text === 'string') {
    text = payload.text
  } else if (payload.text?.body) {
    text = payload.text.body
  } else if (payload.whatsapp_message?.text?.body) {
    text = payload.whatsapp_message.text.body
  }

  // Media (flat media[] or nested in whatsapp_message)
  let mediaUrl: string | undefined
  let mediaMime: string | undefined
  let mediaKind: ParsedInboundWhatsApp['mediaKind']

  if (payload.media?.[0]?.url) {
    mediaUrl = payload.media[0].url
    mediaMime = payload.media[0].content_type
    if (mediaMime?.startsWith('audio/')) mediaKind = 'audio'
    else if (mediaMime?.startsWith('image/')) mediaKind = 'image'
    else if (mediaMime?.startsWith('application/')) mediaKind = 'document'
    else mediaKind = 'other'
    if (payload.media[0].caption && !text) text = payload.media[0].caption
  } else if (payload.whatsapp_message) {
    const m = payload.whatsapp_message
    if (m.audio?.url) {
      mediaUrl = m.audio.url
      mediaMime = m.audio.mime_type
      mediaKind = 'audio'
    } else if (m.image?.url) {
      mediaUrl = m.image.url
      mediaMime = m.image.mime_type
      mediaKind = 'image'
      if (m.image.caption && !text) text = m.image.caption
    } else if (m.document?.url) {
      mediaUrl = m.document.url
      mediaMime = m.document.mime_type
      mediaKind = 'document'
    }
  }

  return { messageId, from, fromName, to, text, mediaUrl, mediaMime, mediaKind }
}
