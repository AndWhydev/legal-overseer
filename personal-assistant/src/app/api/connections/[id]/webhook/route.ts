import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyWebhookSignature } from '@/lib/connections'
import { computeContentHash } from '@/lib/channels/dedup'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/[id]/webhook
 * Generic webhook receiver — no session auth.
 * Uses HMAC signature verification when webhook_secret is set.
 */
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

  const { data: conn, error: connErr } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .single()

  if (connErr || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (conn.status !== 'connected') {
    return NextResponse.json({ error: `Connection status: ${conn.status}` }, { status: 409 })
  }

  // Read raw body for signature verification
  const rawBody = await request.text()

  // Verify webhook signature if secret is configured
  if (conn.webhook_secret) {
    const signature =
      request.headers.get('x-webhook-signature') ||
      request.headers.get('x-hub-signature-256')?.replace('sha256=', '') ||
      request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
    }

    const valid = verifyWebhookSignature(rawBody, signature, conn.webhook_secret)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  }

  // Parse payload
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const externalId = `webhook-${id}-${Date.now()}`
  const contentHash = computeContentHash('webhook', undefined, JSON.stringify(payload).slice(0, 200))
  const start = Date.now()

  const { error: insertErr } = await supabase
    .from('channel_messages')
    .insert({
      org_id: conn.org_id,
      channel: conn.provider,
      external_id: externalId,
      sender: 'webhook',
      body: JSON.stringify(payload),
      received_at: new Date().toISOString(),
      is_actionable: true,
      priority: 'medium',
      processed: false,
      metadata: {
        _webhook: true,
        _connection_id: id,
        _ingested_at: new Date().toISOString(),
      },
      content_hash: contentHash,
    })

  const durationMs = Date.now() - start

  if (insertErr) {
    logger.error(`[webhook] connection=${id} insert error: ${insertErr.message}`)
    await supabase.from('connection_sync_logs').insert({
      connection_id: id,
      status: 'error',
      messages_found: 1,
      messages_inserted: 0,
      duplicates: 0,
      error_message: insertErr.message,
      duration_ms: durationMs,
    })
    return NextResponse.json({ error: 'Failed to store webhook payload' }, { status: 500 })
  }

  await supabase.from('connection_sync_logs').insert({
    connection_id: id,
    status: 'success',
    messages_found: 1,
    messages_inserted: 1,
    duplicates: 0,
    error_message: null,
    duration_ms: durationMs,
  })

  logger.info(`[webhook] connection=${id} provider=${conn.provider} stored in ${durationMs}ms`)

  return NextResponse.json({ ok: true })
}
