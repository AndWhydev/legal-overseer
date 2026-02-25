import { NextRequest, NextResponse } from 'next/server'
import { parseCalendlyWebhook } from '@/lib/channels/calendly'
import type { CalendlyWebhookPayload } from '@/lib/channels/calendly'

/**
 * Calendly webhook endpoint.
 *
 * Receives invitee.created and invitee.canceled events.
 * Calendly signs webhooks with a shared secret via the
 * Calendly-Webhook-Signature header (HMAC SHA256).
 */
export async function POST(request: NextRequest) {
  const webhookSignature = request.headers.get('calendly-webhook-signature')

  // In production, verify HMAC signature against stored webhook signing key.
  // For now we accept and log a warning if missing.
  if (!webhookSignature) {
    console.warn('[webhook/calendly] Received unsigned request')
  }

  try {
    const body = (await request.json()) as CalendlyWebhookPayload
    const parsed = parseCalendlyWebhook(body)

    console.log('[webhook/calendly] Event:', parsed.event, parsed.payload?.uri)

    // Dispatch based on event type
    switch (parsed.event) {
      case 'invitee.created':
        console.log('[webhook/calendly] New booking:', parsed.payload.name, parsed.payload.email)
        break
      case 'invitee.canceled':
        console.log('[webhook/calendly] Cancellation:', parsed.payload.name, parsed.payload.email)
        break
      default:
        console.log('[webhook/calendly] Unknown event type:', parsed.event)
    }

    return NextResponse.json({ received: true, event: parsed.event })
  } catch (err) {
    console.error('[webhook/calendly] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}
