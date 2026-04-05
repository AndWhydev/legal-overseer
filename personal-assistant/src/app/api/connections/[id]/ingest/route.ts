import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isDuplicate, computeContentHash } from '@/lib/channels/dedup'
import { logger } from '@/lib/core/logger'
import type { ChannelMessage } from '@/lib/channels/types'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/[id]/ingest
 *
 * Generic bridge ingest endpoint. External scripts (outlook.py, iMessage bridge, etc.)
 * POST envelope payloads here. The endpoint normalizes them into ChannelMessages and
 * inserts them into the same pipeline as polled messages.
 *
 * Authentication: Bearer token must match the connection's bridge_token.
 *
 * Envelope format:
 * {
 *   messages: [{
 *     id: string,              // external message ID
 *     sender: string,          // sender display name
 *     sender_email?: string,   // sender email
 *     subject?: string,        // email subject
 *     body: string,            // plain text body
 *     body_html?: string,      // HTML body (optional)
 *     received_at: string,     // ISO 8601 timestamp
 *     metadata?: object,       // arbitrary metadata
 *   }]
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: connectionId } = await params

  // Create service-role client (no user auth needed for bridge)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey)

  // Look up connection
  const { data: conn, error: connErr } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (connErr || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Verify bridge token
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  const expectedToken = conn.bridge_token

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 })
  }

  // Check connection is active
  if (conn.status !== 'connected') {
    return NextResponse.json({ error: `Connection status: ${conn.status}` }, { status: 409 })
  }

  // Parse envelope
  let body: { messages: EnvelopeMessage[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  // Cap batch size
  if (body.messages.length > 100) {
    return NextResponse.json({ error: 'Max 100 messages per batch' }, { status: 400 })
  }

  const orgId = conn.org_id as string
  const channelType = conn.channel_type as string
  let inserted = 0
  let duplicates = 0
  const errors: string[] = []

  for (const envelope of body.messages) {
    if (!envelope.id || !envelope.body) {
      errors.push(`Skipped message: missing id or body`)
      continue
    }

    const msg: ChannelMessage = {
      id: envelope.id,
      channel: channelType as ChannelMessage['channel'],
      externalId: envelope.id,
      sender: envelope.sender || 'Unknown',
      senderEmail: envelope.sender_email,
      subject: envelope.subject,
      body: envelope.body,
      bodyFull: envelope.body_html || envelope.body,
      receivedAt: new Date(envelope.received_at || new Date().toISOString()),
      isActionable: true,
      priority: 'medium',
      metadata: envelope.metadata || {},
    }

    // Dedup check
    const dupResult = await isDuplicate(supabase, orgId, msg)
    if (dupResult.duplicate) {
      duplicates++
      continue
    }

    const contentHash = computeContentHash(msg.sender, msg.subject, msg.body)

    // Insert into channel_messages (same table as polled messages)
    const { error: upsertErr } = await supabase
      .from('channel_messages')
      .upsert(
        {
          org_id: orgId,
          channel: channelType,
          external_id: msg.externalId,
          sender: msg.sender,
          sender_email: msg.senderEmail || null,
          subject: msg.subject || null,
          body: msg.body,
          body_full: msg.bodyFull || null,
          received_at: msg.receivedAt.toISOString(),
          is_actionable: msg.isActionable,
          priority: msg.priority,
          processed: false,
          metadata: {
            ...msg.metadata,
            _bridge: true,
            _connection_id: connectionId,
            _ingested_at: new Date().toISOString(),
          },
          content_hash: contentHash,
        },
        { onConflict: 'org_id,channel,external_id', ignoreDuplicates: true }
      )

    if (upsertErr) {
      errors.push(`Failed to insert ${envelope.id}: ${upsertErr.message}`)
    } else {
      inserted++
    }
  }

  // Update connection metadata and increment message_count
  await supabase
    .from('org_connections')
    .update({
      last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  if (inserted > 0) {
    await supabase.from("org_connections").update({ message_count: (conn.message_count || 0) + inserted, updated_at: new Date().toISOString() }).eq("id", connectionId)
  }

  // Log sync event
  await supabase.from('connection_sync_logs').insert({
    connection_id: connectionId,
    status: errors.length > 0 && inserted === 0 ? 'error' : errors.length > 0 ? 'partial' : 'success',
    messages_found: body.messages.length,
    messages_inserted: inserted,
    duplicates,
    error_message: errors.length > 0 ? errors.join('; ') : null,
    duration_ms: null,
  })

  logger.info(
    `[bridge-ingest] connection=${connectionId} channel=${channelType} inserted=${inserted} duplicates=${duplicates} errors=${errors.length}`
  )

  return NextResponse.json({
    ok: true,
    inserted,
    duplicates,
    errors: errors.length > 0 ? errors : undefined,
  })
}

interface EnvelopeMessage {
  id: string
  sender?: string
  sender_email?: string
  subject?: string
  body: string
  body_html?: string
  received_at?: string
  metadata?: Record<string, unknown>
}

/**
 * GET /api/connections/[id]/ingest
 *
 * Health check — returns connection status.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: connectionId } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey)

  const { data: conn, error } = await supabase
    .from('org_connections')
    .select('id, org_id, provider, status, last_sync_at, message_count')
    .eq('id', connectionId)
    .single()

  if (error || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: conn.id,
    channel: conn.provider,
    status: conn.status,
    last_sync: conn.last_sync_at,
    message_count: conn.message_count,
  })
}
