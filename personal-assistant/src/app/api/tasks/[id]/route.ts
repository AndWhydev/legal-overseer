import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

// Allowlist of fields that can be updated on tasks
const ALLOWED_TASK_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'due_date',
  'assigned_to',
  'completed_at',
  'column_id',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { id } = await params
  const body = await request.json()

  // Filter to only allowed fields
  const filteredBody: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([key]) => ALLOWED_TASK_FIELDS.includes(key as any))
  )

  // Merge metadata (jsonb) — preserve agent-set fields while allowing user edits
  if (body.metadata && typeof body.metadata === 'object') {
    const { data: existing, error: fetchError } = await supabase
      .from('tasks')
      .select('metadata')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    const existingMetadata = (existing?.metadata as Record<string, unknown>) ?? {}
    filteredBody.metadata = { ...existingMetadata, ...body.metadata }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(filteredBody)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { id } = await params

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: id })
}
