import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { getActiveOrgId } from '@/lib/tenancy'
import { createConnectorManager } from '@/lib/connectors'

/**
 * DELETE /api/bridges/[connectionId]
 *
 * Legacy endpoint kept for the bridge-specific UI flow. Routes through
 * the unified ConnectorManager so external resources (Fly machine,
 * volume, Mac VPS) are torn down consistently with /api/connections.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  const manager = createConnectorManager(getServiceClient())
  const result = await manager.disconnect(connectionId, {
    hard: true,
    initiator: 'user',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
