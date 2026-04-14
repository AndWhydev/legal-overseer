import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getServiceClient } from '@/lib/supabase/service-client'
import { createConnectorManager } from '@/lib/connectors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/[id]
 * Get connection details, verified to belong to the user's org.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { data: connection, error } = await ctx.supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (error || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  return NextResponse.json({ connection })
}

/**
 * PATCH /api/connections/[id]
 * Update connection fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  // Verify ownership
  const { data: existing } = await ctx.supabase
    .from('org_connections')
    .select('id')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data: connection, error } = await ctx.supabase
    .from('org_connections')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ connection })
}

/**
 * DELETE /api/connections/[id]
 * Full transport-aware disconnect via ConnectorManager (destroys external
 * resources, revokes Composio accounts, rotates webhook secrets, etc).
 *
 * Equivalent to POST /api/connections/[id]/disconnect with `{hard: true}`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  // Ownership check against the user's RLS-scoped client.
  const { data: existing } = await ctx.supabase
    .from('org_connections')
    .select('id, transport')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const manager = createConnectorManager(getServiceClient())
  const result = await manager.disconnect(id, {
    hard: true,
    initiator: 'user',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
