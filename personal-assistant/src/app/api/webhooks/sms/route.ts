import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, receiveSMS } from '@/lib/channels/sms'
import type { TelnyxWebhookPayload } from '@/lib/channels/sms'

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000000'

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
    console.warn('[webhook/sms] TELNYX_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Get headers for signature verification
    const signature = request.headers.get('telnyx-signature-ed25519')
    const timestamp = request.headers.get('telnyx-timestamp')

    if (!timestamp || !signature) {
      console.warn('[webhook/sms] Missing timestamp or signature headers')
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
    }

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(rawBody, signature, timestamp)
    if (!isValid) {
      console.warn('[webhook/sms] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse JSON body
    let payload: TelnyxWebhookPayload
    try {
      payload = JSON.parse(rawBody) as TelnyxWebhookPayload
    } catch {
      console.error('[webhook/sms] Invalid JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Check event type
    if (payload.data?.event_type !== 'message.received') {
      console.log('[webhook/sms] Ignoring event type:', payload.data?.event_type)
      return NextResponse.json({ received: true, event_type: payload.data?.event_type })
    }

    // Parse inbound SMS
    const sms = receiveSMS(payload)
    if (!sms) {
      console.warn('[webhook/sms] Failed to parse SMS payload')
      return NextResponse.json({ error: 'Failed to parse SMS' }, { status: 400 })
    }

    // Persist to channel_messages
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ) as any

    const { error } = await supabase.from('channel_messages').insert({
      org_id: DEFAULT_ORG_ID,
      channel: 'sms',
      external_id: sms.id,
      sender: sms.from,
      subject: `SMS from ${sms.from}`,
      body: sms.text.slice(0, 2000).trim(),
      received_at: sms.timestamp.toISOString(),
      is_actionable: false,
      priority: 'medium',
      processed: false,
      metadata: {
        webhook_event: true,
        event_type: 'message.received',
        from_number: sms.from,
        to_number: sms.to,
      },
    })

    if (error) {
      // Unique constraint violation means duplicate — skip silently
      if (error.code === '23505') {
        console.log('[webhook/sms] Duplicate SMS event skipped:', sms.id)
      } else {
        console.error('[webhook/sms] Failed to persist SMS:', error.message)
      }
    } else {
      console.log('[webhook/sms] SMS message persisted:', sms.id)
    }

    return NextResponse.json({ received: true, message_id: sms.id, persisted: !error })
  } catch (err) {
    console.error('[webhook/sms] Unexpected error:', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
