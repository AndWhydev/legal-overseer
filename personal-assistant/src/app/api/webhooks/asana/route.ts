import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseAsanaWebhookEvents, verifyAsanaWebhookSignature } from '@/lib/channels/asana'
import type { AsanaWebhookEvent } from '@/lib/channels/asana'
import { logger } from '@/lib/core/logger';

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Asana webhook endpoint.
 *
 * Asana sends a handshake request (POST with X-Hook-Secret header) to verify
 * the endpoint, then delivers events as POST with JSON body.
 */
export async function POST(request: NextRequest) {
  // Handshake: Asana sends X-Hook-Secret header during webhook registration
  const hookSecret = request.headers.get('x-hook-secret')
  if (hookSecret) {
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Hook-Secret': hookSecret },
    })
  }

  const rawBody = await request.text()

  // Verify webhook signature
  const signature = request.headers.get('x-hook-signature')
  const webhookSecret = process.env.ASANA_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    logger.warn('[webhook/asana] Rejected unsigned request')
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
  }

  try {
    const valid = await verifyAsanaWebhookSignature(rawBody, signature, webhookSecret)
    if (!valid) {
      logger.warn('[webhook/asana] Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  } catch (err) {
    logger.error('[webhook/asana] Signature verification failed:', err)
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody)
    const events = parseAsanaWebhookEvents(body)

    if (events.length === 0) {
      return NextResponse.json({ received: true, count: 0 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )

    let persisted = 0
    for (const event of events) {
      const { error } = await supabase.from('channel_messages').insert({
        org_id: DEFAULT_ORG_ID,
        channel: 'asana',
        external_id: `asana-${event.resource.gid}-${event.action}`,
        sender: 'Asana',
        subject: formatAsanaSubject(event),
        body: formatAsanaBody(event),
        received_at: new Date().toISOString(),
        is_actionable: event.action !== 'removed',
        priority: 'medium',
        processed: false,
        metadata: {
          webhook_event: true,
          action: event.action,
          resource_type: event.resource.resource_type,
          resource_gid: event.resource.gid,
          parent_gid: event.parent?.gid,
          parent_type: event.parent?.resource_type,
          change_field: event.change?.field,
          change_action: event.change?.action,
        },
      })

      if (error) {
        // Unique constraint violation means duplicate — skip silently
        if (error.code === '23505') {
          logger.info('[webhook/asana] Duplicate event skipped:', event.resource.gid, event.action)
        } else {
          logger.error('[webhook/asana] Failed to persist event:', error.message)
        }
      } else {
        persisted++
      }
    }

    logger.info(`[webhook/asana] Persisted ${persisted}/${events.length} events`)
    return NextResponse.json({ received: true, count: events.length, persisted })
  } catch (err) {
    logger.error('[webhook/asana] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}

function formatAsanaSubject(event: AsanaWebhookEvent): string {
  const action = event.action.charAt(0).toUpperCase() + event.action.slice(1)
  return `[Asana] ${event.resource.resource_type} ${action}: ${event.resource.gid}`
}

function formatAsanaBody(event: AsanaWebhookEvent): string {
  const parts = [
    `Action: ${event.action}`,
    `Resource: ${event.resource.resource_type} (${event.resource.gid})`,
  ]
  if (event.parent) {
    parts.push(`Parent: ${event.parent.resource_type} (${event.parent.gid})`)
  }
  if (event.change) {
    parts.push(`Change: ${event.change.field} ${event.change.action}`)
  }
  return parts.join('\n')
}
