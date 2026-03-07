import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  verifySlackSignature,
  handleSlackUrlChallenge,
  parseSlackWebhookEvent,
} from '@/lib/channels/slack'
import type { SlackEventPayload } from '@/lib/channels/slack'

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000000'

/**
 * Slack webhook endpoint.
 *
 * Slack sends:
 * 1. A url_verification request during setup with a challenge parameter
 * 2. Event callbacks for message events, reaction events, etc.
 *
 * All requests include:
 * - X-Slack-Request-Timestamp header
 * - X-Slack-Signature header (v0=<HMAC>)
 */
export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    logger.warn('[webhook/slack] SLACK_SIGNING_SECRET not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  // Read raw body for signature verification
  const rawBody = await request.text()

  // Get request timestamp and signature headers
  const timestamp = request.headers.get('x-slack-request-timestamp')
  const signature = request.headers.get('x-slack-signature')

  if (!timestamp || !signature) {
    logger.warn('[webhook/slack] Missing timestamp or signature headers')
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
  }

  // Verify timestamp is recent (within 5 minutes)
  const requestTime = parseInt(timestamp)
  const currentTime = Math.floor(Date.now() / 1000)
  if (Math.abs(currentTime - requestTime) > 300) {
    logger.warn('[webhook/slack] Request timestamp too old:', timestamp)
    return NextResponse.json({ error: 'Timestamp too old' }, { status: 401 })
  }

  // Reconstruct base string for signature verification
  const baseString = `v0:${timestamp}:${rawBody}`

  // Verify signature
  try {
    const isValid = await verifySlackSignatureWithTimestamp(
      baseString,
      signature,
      signingSecret,
    )

    if (!isValid) {
      logger.warn('[webhook/slack] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } catch (err) {
    logger.error('[webhook/slack] Signature verification error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 401 })
  }

  // Parse JSON body
  let payload: SlackEventPayload
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload
  } catch {
    logger.error('[webhook/slack] Invalid JSON')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle URL verification challenge
  const challenge = handleSlackUrlChallenge(payload)
  if (challenge) {
    logger.info('[webhook/slack] Responding to url_verification challenge')
    return NextResponse.json(challenge)
  }

  // Process event
  if (payload.type === 'event_callback' && payload.event) {
    return await handleSlackEvent(payload)
  }

  logger.info('[webhook/slack] Ignoring non-event payload:', payload.type)
  return NextResponse.json({ received: true })
}

async function verifySlackSignatureWithTimestamp(
  baseString: string,
  signature: string,
  signingSecret: string,
): Promise<boolean> {
  const { createHmac } = await import('crypto')

  try {
    const [version, hash] = signature.split('=')
    if (version !== 'v0') {
      logger.warn('[webhook/slack] Invalid signature version:', version)
      return false
    }

    const hmac = createHmac('sha256', signingSecret)
    hmac.update(baseString)
    const computedHash = hmac.digest('hex')

    return computedHash === hash
  } catch (err) {
    logger.warn('[webhook/slack] Signature verification error:', err)
    return false
  }
}

async function handleSlackEvent(payload: SlackEventPayload): Promise<NextResponse> {
  try {
    const event = payload.event
    if (!event) {
      return NextResponse.json({ error: 'No event in payload' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ) as any

    // Process different event types
    if (event.type === 'message') {
      return await handleMessageEvent(supabase, event)
    }

    if (event.type === 'reaction_added') {
      return await handleReactionEvent(supabase, event)
    }

    logger.info('[webhook/slack] Ignoring event type:', event.type)
    return NextResponse.json({ received: true, event_type: event.type })
  } catch (err) {
    logger.error('[webhook/slack] Error processing event:', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 400 })
  }
}

async function handleMessageEvent(
  supabase: any,
  event: SlackEventPayload['event'],
): Promise<NextResponse> {
  if (!event || !event.text || !event.user || !event.ts || !event.channel) {
    logger.info('[webhook/slack] Skipping message event with missing fields')
    return NextResponse.json({ received: true })
  }

  const { error } = await supabase.from('channel_messages').insert({
    org_id: DEFAULT_ORG_ID,
    channel: 'slack',
    external_id: `slack-${event.channel}-${event.ts}`,
    sender: event.user,
    subject: `#${event.channel}`,
    body: event.text.slice(0, 2000).trim(),
    received_at: new Date(parseInt(event.ts) * 1000).toISOString(),
    is_actionable: false,
    priority: 'medium',
    processed: false,
    metadata: {
      webhook_event: true,
      event_type: 'message',
      user_id: event.user,
      channel_id: event.channel,
      ts: event.ts,
      thread_ts: event.thread_ts,
    },
  })

  if (error) {
    // Unique constraint violation means duplicate — skip silently
    if (error.code === '23505') {
      logger.info('[webhook/slack] Duplicate message event skipped:', event.ts)
    } else {
      logger.error('[webhook/slack] Failed to persist message:', error.message)
    }
  } else {
    logger.info('[webhook/slack] Message event persisted:', event.ts)
  }

  return NextResponse.json({ received: true, event_type: 'message', persisted: !error })
}

async function handleReactionEvent(
  supabase: any,
  event: SlackEventPayload['event'],
): Promise<NextResponse> {
  if (!event || !event.reaction || !event.user || !event.item) {
    logger.info('[webhook/slack] Skipping reaction event with missing fields')
    return NextResponse.json({ received: true })
  }

  const { error } = await supabase.from('channel_messages').insert({
    org_id: DEFAULT_ORG_ID,
    channel: 'slack',
    external_id: `slack-reaction-${event.item.ts}-${event.reaction}`,
    sender: event.user,
    subject: `Reaction: :${event.reaction}:`,
    body: `User reacted with :${event.reaction}: to message in ${event.item.channel}`,
    received_at: new Date().toISOString(),
    is_actionable: false,
    priority: 'low',
    processed: false,
    metadata: {
      webhook_event: true,
      event_type: 'reaction_added',
      user_id: event.user,
      reaction: event.reaction,
      item_type: event.item.type,
      item_channel: event.item.channel,
      item_ts: event.item.ts,
    },
  })

  if (error) {
    if (error.code === '23505') {
      logger.info('[webhook/slack] Duplicate reaction event skipped:', event.reaction)
    } else {
      logger.error('[webhook/slack] Failed to persist reaction:', error.message)
    }
  } else {
    logger.info('[webhook/slack] Reaction event persisted')
  }

  return NextResponse.json({ received: true, event_type: 'reaction_added', persisted: !error })
}
