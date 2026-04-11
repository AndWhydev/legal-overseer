import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: connections } = await supabase
    .from('org_connections')
    .select('id, provider, display_name, status, transport, message_count, last_sync_at, last_error, config')
    .eq('org_id', orgId)
    .in('provider', ['imessage', 'whatsapp', 'android-messages'])
    .not('config->fly_machine_id', 'is', null)
    .order('created_at', { ascending: true })

  const bridges = (connections || []).map(conn => {
    const config = conn.config as Record<string, unknown>
    return {
      connection_id: conn.id,
      protocol: conn.provider,
      display_name: conn.display_name,
      status: conn.status,
      message_count: conn.message_count,
      last_sync_at: conn.last_sync_at,
      last_error: conn.last_error,
      linked_at: config.linked_at || null,
      last_message_at: config.last_message_at || null,
      suspended: config.suspended || false,
    }
  })

  return NextResponse.json({ bridges })
}
