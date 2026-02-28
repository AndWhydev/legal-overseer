import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCalendlyWebhook, verifyCalendlyWebhookSignature } from '@/lib/channels/calendly'
import type { CalendlyWebhookPayload } from '@/lib/channels/calendly'

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Calendly webhook endpoint.
 *
 * Receives invitee.created and invitee.canceled events.
 * Calendly signs webhooks with a shared secret via the
 * Calendly-Webhook-Signature header (HMAC SHA256).
 */
export async function POST(request: NextRequest) {
  const webhookSignature = request.headers.get('calendly-webhook-signature')
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY

  if (!webhookSignature || !signingKey) {
    console.warn('[webhook/calendly] Rejected unsigned request')
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
  }

  const rawBody = await request.text()

  const verifyResult = await verifyCalendlyWebhookSignature(rawBody, webhookSignature, signingKey)
  if (!verifyResult.valid) {
    console.warn('[webhook/calendly] Invalid webhook signature:', verifyResult.error)
    return NextResponse.json({ error: verifyResult.error || 'Invalid webhook signature' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody) as CalendlyWebhookPayload
    const parsed = parseCalendlyWebhook(body)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )

    const invitee = parsed.payload
    const scheduledEvent = invitee.scheduled_event
    const isBooking = parsed.event === 'invitee.created'
    const isCancellation = parsed.event === 'invitee.canceled'

    const subject = isBooking
      ? `[Calendly] New booking: ${invitee.name || 'Unknown'}`
      : isCancellation
        ? `[Calendly] Cancellation: ${invitee.name || 'Unknown'}`
        : `[Calendly] ${parsed.event}: ${invitee.name || 'Unknown'}`

    const bodyParts = [
      `Event: ${parsed.event}`,
      `Invitee: ${invitee.name || 'Unknown'}`,
      `Email: ${invitee.email || 'N/A'}`,
    ]
    if (scheduledEvent) {
      bodyParts.push(
        `Meeting: ${scheduledEvent.name}`,
        `Start: ${scheduledEvent.start_time}`,
        `End: ${scheduledEvent.end_time}`,
      )
    }

    const { error } = await supabase.from('channel_messages').insert({
      org_id: DEFAULT_ORG_ID,
      channel: 'calendly',
      external_id: invitee.uri,
      sender: invitee.name || 'Calendly',
      sender_email: invitee.email || null,
      subject,
      body: bodyParts.join('\n'),
      received_at: new Date().toISOString(),
      is_actionable: isBooking,
      priority: isBooking ? 'high' : 'medium',
      processed: false,
      metadata: {
        webhook_event: true,
        event_type: parsed.event,
        invitee_uri: invitee.uri,
        invitee_name: invitee.name,
        invitee_email: invitee.email,
        scheduled_event_uri: scheduledEvent?.uri,
        scheduled_event_name: scheduledEvent?.name,
        scheduled_event_start: scheduledEvent?.start_time,
        scheduled_event_end: scheduledEvent?.end_time,
      },
    })

    if (error) {
      if (error.code === '23505') {
        console.log('[webhook/calendly] Duplicate event skipped:', invitee.uri)
      } else {
        console.error('[webhook/calendly] Failed to persist event:', error.message)
      }
    } else {
      console.log('[webhook/calendly] Persisted event:', parsed.event, invitee.name)
    }

    return NextResponse.json({ received: true, event: parsed.event })
  } catch (err) {
    console.error('[webhook/calendly] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}
