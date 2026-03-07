import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteOrgCredential } from '@/lib/integrations/credentials'
import { logAuditEvent } from '@/lib/audit/logger'
import { getActiveOrgId } from '@/lib/tenancy'

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
    console.error('[channels/disconnect]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
