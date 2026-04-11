import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/bridges/qr-callback
 *
 * Called by the bridge machine when it generates a QR code during the
 * WhatsApp / Android Messages linking flow.
 *
 * The bridge authenticates with its provisioning secret (stored in
 * org_connections.config.provisioning_secret). On success the QR data
 * is written to org_connections.config.qr_data so the link-status
 * endpoint can relay it back to the dashboard.
 *
 * Request body:
 *   {
 *     connection_id: string   — UUID of the org_connections row
 *     secret:        string   — provisioning_secret from the bridge config
 *     qr:            string   — data URI or base64 QR image / pairing code
 *   }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  let body: { connection_id?: string; secret?: string; qr?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { connection_id, secret, qr } = body

  if (!connection_id || !secret || !qr) {
    return NextResponse.json(
      { error: 'Missing required fields: connection_id, secret, qr' },
      { status: 400 },
    )
  }

  // Fetch the connection — no user auth required here because the bridge
  // authenticates via its provisioning secret instead.
  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config, status')
    .eq('id', connection_id)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const config = (conn.config ?? {}) as Record<string, unknown>
  const storedSecret = config.provisioning_secret as string | undefined

  if (!storedSecret || storedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Store the QR data and clear any stale QR on new delivery
  const updatedConfig: Record<string, unknown> = {
    ...config,
    qr_data: qr,
    qr_received_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('org_connections')
    .update({
      config: updatedConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
