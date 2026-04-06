import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, getProviderRegistry } from '@/lib/connections'
import type { OrgConnection } from '@/lib/connections'
import { computeContentHash } from '@/lib/channels/dedup'

export const maxDuration = 60

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey)

  const { data: conn } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  if (conn.status !== 'connected' && !(conn.provider === 'imessage' && conn.status === 'provisioning')) {
    return NextResponse.json({ error: `Connection status: ${conn.status}` }, { status: 409 })
  }

  // Clone request for potential provider-specific parsing
  const rawBody = await request.text()

  // Verify signature if webhook_secret is set
  if (conn.webhook_secret) {
    const signature = request.headers.get('x-webhook-signature')
      || request.headers.get('x-hub-signature-256')
      || request.headers.get('stripe-signature')

    if (!signature || !verifyWebhookSignature(rawBody, signature, conn.webhook_secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // For iMessage (BlueBubbles): verify token from query param
  if (conn.provider === 'imessage') {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const expectedToken = (conn.config as Record<string, unknown>).bb_password as string
    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
  }

  const orgId = conn.org_id as string

  // Check if provider has a custom webhookParse handler
  const registry = getProviderRegistry()
  const provider = registry.get(conn.provider)

  if (provider?.webhookParse) {
    // Use provider-specific webhook parser (e.g., Beeper/Matrix)
    const fakeReq = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: rawBody,
    })
    const envelopes = await provider.webhookParse(fakeReq, conn as unknown as OrgConnection)

    let inserted = 0
    let duplicates = 0

    for (const envelope of envelopes) {
      const contentHash = computeContentHash(
        envelope.payload.sender?.name || conn.provider,
        envelope.payload.subject,
        envelope.payload.body,
      )

      const { error: insertErr } = await supabase
        .from('channel_messages')
        .upsert({
          org_id: orgId,
          channel: conn.provider,
          external_id: envelope.dedup_key,
          sender: envelope.payload.sender?.name || 'Unknown',
          sender_email: envelope.payload.sender?.email || null,
          subject: envelope.payload.subject || null,
          body: envelope.payload.body,
          received_at: envelope.timestamp,
          is_actionable: true,
          priority: 'medium',
          processed: false,
          metadata: {
            _webhook: true,
            _connection_id: id,
            _ingested_at: new Date().toISOString(),
            ...envelope.payload.metadata,
          },
          content_hash: contentHash,
        }, { onConflict: 'org_id,channel,external_id', ignoreDuplicates: true })

      if (insertErr) {
        if (insertErr.code === '23505') duplicates++
        else console.error('[webhook] insert failed', insertErr.message)
      } else {
        inserted++
      }
    }

    // Update connection stats
    if (inserted > 0) {
      await supabase
        .from('org_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          message_count: (conn.message_count || 0) + inserted,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }

    // Log sync
    await supabase.from('connection_sync_logs').insert({
      connection_id: id,
      status: inserted > 0 ? 'success' : 'partial',
      messages_found: envelopes.length,
      messages_inserted: inserted,
      duplicates,
    })

    return NextResponse.json({ ok: true, inserted, duplicates })
  }

  // Generic webhook handler (no provider-specific parser)
  const payload = JSON.parse(rawBody)
  const externalId = payload.id || payload.event_id || `webhook-${Date.now()}`
  const contentHash = computeContentHash(
    conn.provider,
    payload.type || 'webhook_event',
    JSON.stringify(payload).slice(0, 500),
  )

  const { error: insertErr } = await supabase
    .from('channel_messages')
    .upsert({
      org_id: orgId,
      channel: conn.provider,
      external_id: externalId,
      sender: conn.provider,
      subject: payload.type || 'Webhook Event',
      body: JSON.stringify(payload, null, 2).slice(0, 5000),
      received_at: new Date().toISOString(),
      is_actionable: true,
      priority: 'medium',
      processed: false,
      metadata: {
        _webhook: true,
        _connection_id: id,
        _event_type: payload.type,
        _ingested_at: new Date().toISOString(),
      },
      content_hash: contentHash,
    }, { onConflict: 'org_id,channel,external_id', ignoreDuplicates: true })

  if (insertErr) {
    console.error('[webhook] insert failed', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  await supabase.from('connection_sync_logs').insert({
    connection_id: id,
    status: 'success',
    messages_found: 1,
    messages_inserted: 1,
    duplicates: 0,
  })

  return NextResponse.json({ ok: true })
}
