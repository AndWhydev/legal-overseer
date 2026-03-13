import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { pollChannel, type PollResult } from '@/lib/channels/relay-daemon'
import type { ChannelType } from '@/lib/channels/types'

export const maxDuration = 60

export async function POST() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const { data: connections } = await supabase
    .from('channel_connections')
    .select('channel_type')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .eq('relay_enabled', true)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: 'No relay-enabled channels', results: [] })
  }

  const results: { channel: string; result: PollResult }[] = []
  for (const conn of connections) {
    const channelType = conn.channel_type as ChannelType
    const result = await pollChannel(supabase, orgId, channelType)
    results.push({ channel: channelType, result })
  }

  const totalInserted = results.reduce((sum, r) => sum + r.result.messagesInserted, 0)
  const totalFound = results.reduce((sum, r) => sum + r.result.messagesFound, 0)

  return NextResponse.json({
    message: `${totalInserted} new messages (${totalFound} checked)`,
    results,
  })
}
