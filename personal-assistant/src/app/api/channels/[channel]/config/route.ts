import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

interface ChannelConfig {
  config: Record<string, unknown>
  poll_interval_seconds: number
  relay_enabled: boolean
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { channel } = await params

  const { data, error } = await supabase
    .from('channel_connections')
    .select('config, poll_interval_seconds, relay_enabled, status')
    .eq('org_id', orgId)
    .eq('channel_type', channel.toLowerCase())
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Channel not found or not connected' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    channel: channel.toLowerCase(),
    config: data.config ?? {},
    poll_interval_seconds: data.poll_interval_seconds ?? 300,
    relay_enabled: data.relay_enabled ?? false,
    status: data.status,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { channel } = await params

  let body: Partial<ChannelConfig>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.config !== undefined) updates.config = body.config
  if (body.poll_interval_seconds !== undefined) updates.poll_interval_seconds = body.poll_interval_seconds
  if (body.relay_enabled !== undefined) updates.relay_enabled = body.relay_enabled

  const { data, error } = await supabase
    .from('channel_connections')
    .update(updates)
    .eq('org_id', orgId)
    .eq('channel_type', channel.toLowerCase())
    .select('config, poll_interval_seconds, relay_enabled, status')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Channel not found or update failed' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    channel: channel.toLowerCase(),
    config: data.config ?? {},
    poll_interval_seconds: data.poll_interval_seconds ?? 300,
    relay_enabled: data.relay_enabled ?? false,
    status: data.status,
  })
}
