import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/[id]
 * Get connection details, verified to belong to the user's org.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: connection, error } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  // Verify ownership
  const { data: existing } = await supabase
    .from('org_connections')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
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

  const { data: connection, error } = await supabase
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
 * Soft delete — sets status to 'disabled'.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: existing } = await supabase
    .from('org_connections')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('org_connections')
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
