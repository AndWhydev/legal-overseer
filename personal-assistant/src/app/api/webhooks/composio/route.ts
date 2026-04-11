import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ChannelType } from '@/lib/channels/types'

export const dynamic = 'force-dynamic'

// Reverse map: Composio toolkit name -> BitBit ChannelType
const TOOLKIT_TO_CHANNEL: Record<string, ChannelType> = {
  gmail: 'gmail',
  outlook: 'outlook',
  googlecalendar: 'calendar',
  asana: 'asana',
  calendly: 'calendly',
  stripe: 'stripe',
  slack: 'slack',
  xero: 'xero',
  instagram: 'instagram',
  facebookpages: 'facebook',
  telegram: 'telegram',
  clickup: 'clickup',
  wordpress: 'wordpress',
  googleanalytics: 'ga4',
  googlesearchconsole: 'gsc',
}

/**
 * POST /api/webhooks/composio
 *
 * Receives trigger event payloads from Composio.
 * Normalizes them into channel_messages and ingests into the pipeline.
 *
 * Payload shape (from Composio docs):
 * {
 *   triggerId: string,
 *   triggerType: string,     // e.g. "GMAIL_NEW_EMAIL"
 *   connectedAccountId: string,
 *   appName: string,         // e.g. "gmail"
 *   data: { ... }            // event-specific payload
 * }
 */
export async function POST(request: NextRequest) {
  let payload: {
    triggerId?: string
    triggerType?: string
    connectedAccountId?: string
    appName?: string
    data?: Record<string, unknown>
  }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { triggerId, triggerType, connectedAccountId, appName, data } = payload

  if (!appName || !data) {
    logger.warn('[webhooks/composio] Missing appName or data in payload')
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const channel = TOOLKIT_TO_CHANNEL[appName.toLowerCase()]
  if (!channel) {
    logger.warn(`[webhooks/composio] Unknown toolkit: ${appName}`)
    return NextResponse.json({ error: `Unknown app: ${appName}` }, { status: 400 })
  }

  logger.info('[webhooks/composio] Trigger event received', {
    triggerId,
    triggerType,
    appName,
    channel,
    connectedAccountId,
  })

  // Look up the org that owns this connected account
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    logger.error('[webhooks/composio] Missing Supabase credentials')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Find the org_connection that has this composio_connected_account_id
  const { data: connection } = await supabase
    .from('org_connections')
    .select('org_id, id')
    .eq('config->>composio_connected_account_id', connectedAccountId)
    .limit(1)
    .single()

  if (!connection) {
    logger.warn('[webhooks/composio] No org_connection found for connected account', {
      connectedAccountId,
    })
    // Still return 200 to acknowledge receipt (Composio retries on non-2xx)
    return NextResponse.json({ received: true, matched: false })
  }

  const orgId = connection.org_id

  // Normalize trigger data into a channel_message
  const messageId = (data.id as string) || (data.messageId as string) || `composio-trigger-${triggerId}-${Date.now()}`
  const sender = (data.sender as string) || (data.from as string) || (data.author as string) || appName
  const subject = (data.subject as string) || (data.title as string) || (data.name as string)
  const body = (data.body as string) || (data.text as string) || (data.content as string) || (data.message as string) || (data.snippet as string) || ''
  const senderEmail = (data.senderEmail as string) || (data.email as string)

  // Dedup key based on message content
  const dedupKey = `composio-${channel}-${messageId}`

  // Check for duplicate
  const { count } = await supabase
    .from('channel_messages')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('external_id', dedupKey)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Insert into channel_messages
  const { error } = await supabase
    .from('channel_messages')
    .insert({
      org_id: orgId,
      channel,
      external_id: dedupKey,
      sender: typeof sender === 'string' ? sender : appName,
      sender_email: senderEmail || null,
      subject: subject || null,
      body: (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 10000),
      received_at: new Date().toISOString(),
      is_actionable: false,
      priority: 'medium',
      processed: false,
      metadata: {
        source: 'composio-trigger',
        trigger_type: triggerType,
        trigger_id: triggerId,
        connected_account_id: connectedAccountId,
        raw_keys: Object.keys(data),
      },
    })

  if (error) {
    logger.error('[webhooks/composio] Failed to insert channel_message', {
      orgId, channel, error: error.message,
    })
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  // Update last_sync_at on the connection
  await supabase
    .from('org_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', connection.id)

  logger.info('[webhooks/composio] Trigger event ingested', {
    orgId, channel, messageId: dedupKey,
  })

  return NextResponse.json({ received: true, ingested: true })
}
