import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBridge, getActiveBridge, isBaileysAvailable } from '@/lib/channels/baileys-bridge'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

/**
 * GET /api/channels/whatsapp/bridge
 *
 * Returns bridge status for the authenticated user's org.
 * Proxies to standalone Fly.io bridge when WHATSAPP_BRIDGE_URL is configured.
 * Falls back to in-process Baileys for local dev.
 */
export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getActiveOrgId(supabase, user.id)

  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL
  const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET

  // Proxy to standalone Fly.io bridge when configured
  if (bridgeUrl && bridgeSecret) {
    try {
      const res = await fetch(`${bridgeUrl}/bridge/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bridgeSecret}`,
          'X-Org-Id': orgId,
        },
      })

      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error || 'Bridge status check failed' }, { status: res.status })
      }

      return NextResponse.json(data)
    } catch (err) {
      logger.error('[whatsapp-bridge] Failed to reach bridge service for status', { error: String(err) })
      return NextResponse.json({ error: 'Bridge service unreachable' }, { status: 502 })
    }
  }

  // Fallback to in-process bridge for local dev
  const available = await isBaileysAvailable()
  if (!available) {
    return NextResponse.json({
      status: 'unavailable',
      message: 'Baileys library not installed. Install @whiskeysockets/baileys to enable bridge.',
    })
  }

  // Check for active in-memory bridge
  const bridge = getActiveBridge(orgId)
  if (bridge) {
    const status = await bridge.getStatus()
    return NextResponse.json(status)
  }

  // Check for session in database
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, status, qr_data, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) {
    return NextResponse.json({
      status: 'disconnected',
      sessionId: null,
      qrCode: null,
      sessionAge: null,
      lastActivity: null,
    })
  }

  const createdAt = new Date(session.created_at as string)
  const ageHours = Math.round(((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10

  return NextResponse.json({
    status: session.status,
    sessionId: session.id,
    qrCode: (session.qr_data as string) ?? null,
    sessionAge: ageHours,
    lastActivity: null,
  })
}

/**
 * POST /api/channels/whatsapp/bridge
 *
 * Start the Baileys bridge for the authenticated user's org.
 * Proxies to standalone Fly.io bridge when WHATSAPP_BRIDGE_URL is configured.
 * Falls back to in-process Baileys for local dev.
 */
export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getActiveOrgId(supabase, user.id)

  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL
  const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET

  // Proxy to standalone Fly.io bridge when configured
  if (bridgeUrl && bridgeSecret) {
    try {
      const res = await fetch(`${bridgeUrl}/bridge/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bridgeSecret}`,
        },
        body: JSON.stringify({ org_id: orgId }),
      })

      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error || 'Bridge start failed' }, { status: res.status })
      }

      return NextResponse.json({ message: 'Bridge started', ...data })
    } catch (err) {
      logger.error('[whatsapp-bridge] Failed to reach bridge service', { error: String(err) })
      return NextResponse.json({ error: 'Bridge service unreachable' }, { status: 502 })
    }
  }

  // Fallback to in-process bridge for local dev
  const available = await isBaileysAvailable()
  if (!available) {
    return NextResponse.json({
      error: 'Baileys library not installed. Install @whiskeysockets/baileys to enable bridge.',
    }, { status: 503 })
  }

  // Check for existing active bridge
  const existingBridge = getActiveBridge(orgId)
  if (existingBridge) {
    const status = await existingBridge.getStatus()
    if (status.status === 'connected') {
      return NextResponse.json({
        message: 'Bridge already connected',
        ...status,
      })
    }
  }

  try {
    const bridge = await createBridge(supabase, orgId)
    const result = await bridge.start()

    return NextResponse.json({
      message: 'Bridge started',
      sessionId: result.sessionId,
      status: 'pairing',
    })
  } catch (err) {
    logger.error('[bridge-route] Failed to start bridge:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to start bridge',
    }, { status: 500 })
  }
}
