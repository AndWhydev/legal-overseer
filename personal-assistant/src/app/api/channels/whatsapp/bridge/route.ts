import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBridge, getActiveBridge, isBaileysAvailable } from '@/lib/channels/baileys-bridge'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

/**
 * GET /api/channels/whatsapp/bridge
 *
 * Returns bridge status for the authenticated user's org.
 * Includes QR code if in pairing state, session age, and last activity.
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

  // Check if Baileys is available
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
 * If already connected, returns current status instead.
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

  // Check if Baileys is available
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
