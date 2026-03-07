import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllAdapters } from '@/lib/channels/synthesizer'
import { getActiveOrgId } from '@/lib/tenancy'

const CHANNEL_ALIASES: Record<string, string[]> = {
  ga4: ['ga4', 'google-analytics'],
  calendar: ['calendar', 'google-calendar'],
}

function getFromAliasMap<T>(map: Map<string, T>, channelType: string): T | undefined {
  const aliases = CHANNEL_ALIASES[channelType] || [channelType]
  for (const alias of aliases) {
    const value = map.get(alias)
    if (value) return value
  }
  return undefined
}

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  // Query org_integrations for real connection status
  const { data: intData } = await supabase
    .from('org_integrations')
    .select('provider, status, connected_at')
    .eq('org_id', orgId)

  const integrations = intData || []

  const { data: connData } = await supabase
    .from('channel_connections')
    .select('channel_type, last_sync, message_count, status')
    .eq('org_id', orgId)

  const connections = connData || []

  // Build lookup maps
  const integrationMap = new Map(integrations.map(i => [i.provider, i]))
  const connectionMap = new Map(connections.map(c => [c.channel_type, c]))

  const adapters = getAllAdapters()

  const statuses = await Promise.all(
    adapters.map(async (adapter) => {
      // Check org_integrations for real connection state
      const integration = getFromAliasMap(integrationMap, adapter.type)
      const connection = getFromAliasMap(connectionMap, adapter.type)

      // If org_integrations shows connected, use that as source of truth
      const connected = integration?.status === 'connected' || connection?.status === 'connected'

      // Fallback: check adapter availability (env vars configured)
      let available = connected
      if (!available) {
        try {
          available = await adapter.isAvailable()
        } catch {
          // Adapter check failed
        }
      }

      return {
        type: adapter.type,
        name: adapter.name,
        description: adapter.description,
        icon: adapter.icon,
        available,
        connected,
        connectedAt: integration?.connected_at || null,
        lastSync: connection?.last_sync || null,
        messageCount: connection?.message_count || 0,
      }
    })
  )

  return NextResponse.json({ channels: statuses })
}
