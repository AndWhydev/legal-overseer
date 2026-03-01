import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllAdapters } from '@/lib/channels/synthesizer'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  const orgId = profile?.org_id

  // Query org_integrations for real connection status
  let integrations: Array<{ provider: string; status: string; connected_at: string | null }> = []
  if (orgId) {
    const { data } = await supabase
      .from('org_integrations')
      .select('provider, status, connected_at')
      .eq('org_id', orgId)

    integrations = data || []
  }

  // Query channel_connections for last_sync and message_count
  let connections: Array<{ channel_type: string; last_sync: string | null; message_count: number; status: string }> = []
  if (orgId) {
    const { data } = await supabase
      .from('channel_connections')
      .select('channel_type, last_sync, message_count, status')
      .eq('org_id', orgId)

    connections = data || []
  }

  // Build lookup maps
  const integrationMap = new Map(integrations.map(i => [i.provider, i]))
  const connectionMap = new Map(connections.map(c => [c.channel_type, c]))

  const adapters = getAllAdapters()

  const statuses = await Promise.all(
    adapters.map(async (adapter) => {
      // Check org_integrations for real connection state
      const integration = integrationMap.get(adapter.type)
      const connection = connectionMap.get(adapter.type)

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
