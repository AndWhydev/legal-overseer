import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteOrgCredential } from '@/lib/integrations/credentials'
import { logAuditEvent } from '@/lib/audit/logger'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

/**
 * Stop the remote Baileys bridge for an org and invalidate all local sessions.
 * Non-fatal — if the bridge is unreachable we still proceed with local cleanup.
 */
async function teardownWhatsAppBridge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<void> {
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL
  const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET

  // 1. Tell the Fly.io bridge to kill the Baileys socket for this org
  if (bridgeUrl && bridgeSecret) {
    try {
      const res = await fetch(`${bridgeUrl}/bridge/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bridgeSecret}`,
        },
        body: JSON.stringify({ org_id: orgId }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        logger.warn('[channels/disconnect] Bridge stop returned non-OK', { status: res.status, body })
      }
    } catch (err) {
      logger.warn('[channels/disconnect] Bridge unreachable during disconnect (non-fatal)', { error: String(err) })
    }
  }

  // 2. Mark all whatsapp_sessions for this org as disconnected + clear QR data
  if (supabase) {
    await supabase
      .from('whatsapp_sessions')
      .update({
        status: 'disconnected',
        qr_data: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  let body: { channel: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { channel } = body
  if (!channel || typeof channel !== 'string') {
    return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  }

  const channelLower = channel.toLowerCase()

  try {
    // WhatsApp-specific: kill the Baileys bridge session + clear DB sessions
    if (channelLower === 'whatsapp') {
      await teardownWhatsAppBridge(supabase, orgId)
    }

    // Remove credentials from org_integrations
    await deleteOrgCredential(supabase, orgId, channelLower)

    // Mark channel_connections as disconnected, disable relay
    // Historical messages in channel_messages are preserved (user decision)
    await supabase
      .from('channel_connections')
      .update({
        status: 'disconnected',
        relay_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('channel_type', channelLower)

    await logAuditEvent(supabase, {
      orgId,
      actorType: 'user',
      actorId: user.id,
      action: 'deleted',
      entityType: 'channel_connection',
      entityId: channelLower,
      metadata: { channel: channelLower, messages_preserved: true },
    })

    return NextResponse.json({ disconnected: true, channel: channelLower })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect channel'
    logger.error('[channels/disconnect]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}