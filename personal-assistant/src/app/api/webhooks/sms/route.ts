import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, receiveSMS, processInboundSMS } from '@/lib/channels/sms'
import type { TelnyxWebhookPayload } from '@/lib/channels/sms'
import { logger } from '@/lib/core/logger'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'

/**
 * Telnyx SMS webhook endpoint.
 *
 * Telnyx sends inbound SMS messages with headers:
 * - telnyx-signature-ed25519: signature for verification
 * - telnyx-timestamp: Unix timestamp of the request
 *
 * Payload format:
 * {
 *   "data": {
 *     "event_type": "message.received",
 *     "payload": {
 *       "from": { "phone_number": "+61..." },
 *       "to": [{ "phone_number": "+61..." }],
 *       "text": "..."
 *     }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.warn('[webhook/sms] TELNYX_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Get headers for signature verification
    const signature = request.headers.get('telnyx-signature-ed25519')
    const timestamp = request.headers.get('telnyx-timestamp')

    if (!timestamp || !signature) {
      logger.warn('[webhook/sms] Missing timestamp or signature headers')
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
    }

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(rawBody, signature, timestamp)
    if (!isValid) {
      logger.warn('[webhook/sms] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse JSON body
    let payload: TelnyxWebhookPayload
    try {
      payload = JSON.parse(rawBody) as TelnyxWebhookPayload
    } catch {
      logger.error('[webhook/sms] Invalid JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Check event type
    if (payload.data?.event_type !== 'message.received') {
      logger.info('[webhook/sms] Ignoring event type:', payload.data?.event_type)
      return NextResponse.json({ received: true, event_type: payload.data?.event_type })
    }

    // Parse inbound SMS
    const sms = receiveSMS(payload)
    if (!sms) {
      logger.warn('[webhook/sms] Failed to parse SMS payload')
      return NextResponse.json({ error: 'Failed to parse SMS' }, { status: 400 })
    }

    // Resolve org from Telnyx webhook (use 'to' number as external_id to look up channel config)
    const orgId = await resolveOrgFromWebhook('sms', sms.to)
    if (!orgId) {
      logger.warn(
        `[webhook/sms] Could not resolve org for SMS to_number=${sms.to}. Make sure SMS channel is configured in channel_credentials.`
      )
      // Return 200 to prevent Telnyx from retrying, but don't process
      return NextResponse.json({ received: true, message_id: sms.id })
    }

    // Process inbound SMS through conversation adapter pipeline
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )

    const result = await processInboundSMS(supabase, orgId, sms)

    return NextResponse.json({ received: true, message_id: sms.id, persisted: result.persisted })
  } catch (err) {
    logger.error('[webhook/sms] Unexpected error:', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
