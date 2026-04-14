import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getServiceClient } from '@/lib/supabase/service-client'
import { createConnectorManager } from '@/lib/connectors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/[id]/disconnect
 *
 * Explicit, transport-aware disconnect. Routes through ConnectorManager
 * so Composio accounts are revoked remotely, Fly machines are destroyed,
 * webhook secrets are rotated, and the row is either hard-deleted
 * (`hard: true`, default) or soft-disabled.
 *
 * The legacy DELETE /api/connections/[id] route is also wired to this
 * code path via the manager — this endpoint just gives the UI an
 * explicit verb and a body for `hard`/`reason`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership check via the user's scoped client, then delegate cleanup
  // via the service-role client so we can delete across RLS.
  const { data: existing, error: fetchErr } = await ctx.supabase
    .from('org_connections')
    .select('id, transport, org_id, status')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  let body: { hard?: boolean; reason?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  const manager = createConnectorManager(getServiceClient())
  const result = await manager.disconnect(id, {
    hard: body.hard ?? true,
    initiator: 'user',
    reason: body.reason,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
