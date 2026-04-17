/**
 * Telnyx WhatsApp Gateway Webhook
 *
 * Inbound WhatsApp messages from the BitBit gateway number arrive here.
 * Telnyx is the BSP — it receives from Meta, normalizes to Telnyx's envelope,
 * and delivers to this endpoint. Verification uses the same Ed25519 signature
 * scheme as Telnyx SMS.
 *
 * Flow:
 *   1. Verify Telnyx signature
 *   2. Parse inbound payload (text, audio, image)
 *   3. Rate limit per-sender
 *   4. Mark message as read
 *   5. Transcribe voice notes / base64-encode images
 *   6. Resolve identity; unknown numbers → email+OTP onboarding
 *   7. Check org send quota
 *   8. Return 200 to Telnyx; process async via after()
 *   9. Store inbound in channel_messages, enrich, route through pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { verifyWebhookSignature } from '@/lib/channels/sms'
import {
  parseInboundWhatsApp,
  downloadTelnyxMedia,
  markWhatsAppRead,
  type TelnyxWhatsAppWebhook,
} from '@/lib/channels/telnyx-whatsapp'
import { transcribeVoiceNote } from '@/lib/channels/whatsapp-voice'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { enrichInboundMessage } from '@/lib/conversation/inbound-enrichment'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { sendTelnyxWhatsApp } from '@/lib/channels/telnyx-whatsapp'
import { handleUnknownSender } from '@/lib/channels/whatsapp-onboarding'
import {
  isRateLimited,
  checkWhatsAppQuota,
  trackWhatsAppSend,
} from '@/lib/channels/whatsapp-guard'
import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'
import type { ChannelMetadata } from '@/lib/conversation/types'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const webhookStartMs = Date.now()

  // ── Read + verify signature (Ed25519, same as Telnyx SMS) ──────────────
  const rawBody = await request.text()
  const signature = request.headers.get('telnyx-signature-ed25519')
  const timestamp = request.headers.get('telnyx-timestamp')

  if (!signature || !timestamp) {
    logger.warn('[webhook/whatsapp] Missing Telnyx signature headers')
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, timestamp)
  if (!isValid) {
    logger.warn('[webhook/whatsapp] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── Parse envelope ─────────────────────────────────────────────────────
  let webhook: TelnyxWhatsAppWebhook
  try {
    webhook = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = webhook.data?.event_type ?? ''

  // Only process inbound user messages. Ignore delivery receipts, status updates,
  // signup lifecycle events, etc.
  if (eventType !== 'message.received' && !eventType.startsWith('whatsapp.inbound')) {
    logger.info('[webhook/whatsapp] Ignoring event type', { eventType })
    return NextResponse.json({ received: true, event_type: eventType })
  }

  const parsed = parseInboundWhatsApp(webhook)
  if (!parsed || (!parsed.text && !parsed.mediaUrl)) {
    logger.info('[webhook/whatsapp] No parseable content')
    return NextResponse.json({ received: true })
  }

  const { messageId: waMessageId, from: fromPhone, fromName, to: toPhone, mediaUrl, mediaMime, mediaKind } = parsed

  // ── Echo filter: ignore messages sent by our own number ────────────────
  const ownPhone = (process.env.TELNYX_WHATSAPP_FROM_NUMBER || '').replace(/[^\d+]/g, '')
  if (ownPhone && fromPhone.replace(/[^\d+]/g, '') === ownPhone) {
    return NextResponse.json({ received: true })
  }

  // ── Rate limiting ──────────────────────────────────────────────────────
  if (isRateLimited(fromPhone)) {
    return NextResponse.json({ received: true })
  }

  // ── Mark as read (best-effort) ─────────────────────────────────────────
  if (waMessageId) {
    markWhatsAppRead(waMessageId).catch(() => {})
  }

  // ── Process media ──────────────────────────────────────────────────────
  let text = parsed.text
  let channelMetadata: ChannelMetadata | undefined
  let contentBlocks: Anthropic.ContentBlockParam[] | undefined

  if (mediaUrl) {
    const media = await downloadTelnyxMedia(mediaUrl)
    if (media) {
      const effectiveMime = mediaMime || media.mimeType

      if (mediaKind === 'audio') {
        const transcription = await transcribeVoiceNote(media.buffer, effectiveMime)
        if (!transcription) {
          logger.warn('[webhook/whatsapp] Voice note transcription failed')
          return NextResponse.json({ received: true })
        }
        text = text
          ? `${text}\n\n[voice note]: "${transcription}"`
          : `[voice note]: "${transcription}"`
        channelMetadata = { isVoiceNote: true } as ChannelMetadata

      } else if (mediaKind === 'image') {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
        type ValidType = (typeof validTypes)[number]
        const mediaType = validTypes.includes(effectiveMime as ValidType)
          ? (effectiveMime as ValidType)
          : ('image/jpeg' as const)

        contentBlocks = [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: media.buffer.toString('base64') },
        }]
        if (!text) text = '[sent an image]'
      }
    }
  }

  if (!text) {
    return NextResponse.json({ received: true })
  }

  // ── Identity resolution ───────────────────────────────────────────────
  const supabase = getServiceClient()
  if (!supabase) {
    logger.error('[webhook/whatsapp] Supabase service client unavailable')
    return NextResponse.json({ received: true })
  }

  let identity: { userId: string; orgId: string; displayName?: string; email?: string; timezone?: string | null } | null = null
  try {
    const resolved = await resolveChannelIdentity(supabase, {
      channelType: 'whatsapp',
      channelIdentifier: fromPhone,
    })
    if (resolved) {
      identity = {
        userId: resolved.userId,
        orgId: resolved.orgId,
        displayName: resolved.displayName,
        email: resolved.email,
        timezone: resolved.timezone,
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Unknown sender → onboarding flow ──────────────────────────────────
  if (!identity) {
    const handled = await handleUnknownSender(supabase, fromPhone, text)
    if (!handled) {
      await sendTelnyxWhatsApp(
        fromPhone,
        "hey, not set up for new numbers yet — check back soon",
      ).catch(() => {})
    }
    return NextResponse.json({ received: true })
  }

  // ── Send quota check ──────────────────────────────────────────────────
  const quotaOk = await checkWhatsAppQuota(supabase, identity.orgId)
  if (!quotaOk) {
    logger.warn('[webhook/whatsapp] Quota exceeded, not responding', {
      orgId: identity.orgId, from: fromPhone,
    })
    return NextResponse.json({ received: true })
  }

  // ── Return 200 immediately; process async in after() ──────────────────
  after(async () => {
    // Store inbound message for inbox visibility
    const externalId = waMessageId || `wa-${Date.now()}-${fromPhone}`
    const { data: insertedMsg } = await supabase
      .from('channel_messages')
      .upsert({
        org_id: identity.orgId,
        channel: 'whatsapp',
        external_id: externalId,
        sender: fromPhone,
        sender_email: fromPhone,
        body: text,
        received_at: new Date().toISOString(),
        direction: 'inbound',
        priority: 'medium',
        metadata: {
          from_phone: fromPhone,
          to_phone: toPhone,
          sender_name: fromName,
          wa_message_id: waMessageId,
          is_voice_note: channelMetadata?.isVoiceNote || false,
          source: 'telnyx',
        },
      }, { onConflict: 'org_id,channel,external_id' })
      .select('id')
      .single()

    if (insertedMsg) {
      enrichInboundMessage(supabase, {
        messageId: insertedMsg.id as string,
        orgId: identity.orgId,
        channel: 'whatsapp',
        senderIdentifier: fromPhone,
        senderName: identity.displayName ?? fromName ?? null,
        subject: null,
        body: text,
        priority: 'medium',
      }).catch((err) => {
        logger.error('[webhook/whatsapp] Enrichment failed (non-fatal):', err)
      })
    }

    try {
      await handleGatewayMessage({
        channel: 'whatsapp',
        text,
        identity: {
          userId: identity.userId,
          orgId: identity.orgId,
          email: identity.email,
          displayName: identity.displayName ?? fromName,
          timezone: identity.timezone,
        },
        replyTo: fromPhone,
        channelMetadata,
        contentBlocks,
      })

      trackWhatsAppSend(supabase, identity.orgId).catch(() => {})
    } catch (err) {
      logger.error('[webhook/whatsapp] Gateway handler error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    logger.info(JSON.stringify({
      event: 'whatsapp_gateway_processed',
      orgId: identity.orgId,
      totalMs: Date.now() - webhookStartMs,
      source: 'telnyx',
    }))
  })

  return NextResponse.json({ received: true }, {
    headers: { 'X-WhatsApp-Process-Ms': String(Date.now() - webhookStartMs) },
  })
}
