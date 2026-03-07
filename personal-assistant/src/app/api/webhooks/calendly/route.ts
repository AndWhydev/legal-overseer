import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCalendlyWebhook, verifyCalendlyWebhookSignature } from '@/lib/channels/calendly'
import type { CalendlyWebhookPayload } from '@/lib/channels/calendly'
import { logger } from '@/lib/core/logger'
import { resolveOrgFromWebhook } from '@/lib/core/resolve-org'

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
    logger.warn('[webhook/calendly] Rejected unsigned request')
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
  }

  const rawBody = await request.text()

  const verifyResult = await verifyCalendlyWebhookSignature(rawBody, webhookSignature, signingKey)
  if (!verifyResult.valid) {
    logger.warn('[webhook/calendly] Invalid webhook signature:', verifyResult.error)
    return NextResponse.json({ error: verifyResult.error || 'Invalid webhook signature' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody) as CalendlyWebhookPayload
    const parsed = parseCalendlyWebhook(body)

    // Resolve org from Calendly webhook (use fixed Calendly identifier)
    const orgId = await resolveOrgFromWebhook('calendly')
    if (!orgId) {
      logger.warn(
        '[webhook/calendly] Could not resolve org from channel_credentials. Make sure Calendly channel is configured.'
      )
      // Return 200 to prevent Calendly from retrying, but don't process
      return NextResponse.json({ received: true, event: parsed.event })
    }

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
      org_id: orgId,
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
        logger.info('[webhook/calendly] Duplicate event skipped:', invitee.uri)
      } else {
        logger.error('[webhook/calendly] Failed to persist event:', error.message)
      }
    } else {
      logger.info('[webhook/calendly] Persisted event:', parsed.event, invitee.name)
    }

    return NextResponse.json({ received: true, event: parsed.event })
  } catch (err) {
    logger.error('[webhook/calendly] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}
