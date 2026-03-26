import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

/**
 * PATCH /api/agent/inbox/[id] — update message status
 * Body: { action: 'archive' | 'done' | 'undo_done' | 'snooze' | 'spam', snoozed_until?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { action, snoozed_until } = body as { action: string; snoozed_until?: string }

  // Read current metadata to merge (avoid overwriting)
  const { data: current, error: readErr } = await ctx.supabase
    .from('channel_messages')
    .select('metadata, processed')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (readErr || !current) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const metadata = (current.metadata as Record<string, unknown>) || {}

  switch (action) {
    case 'archive': {
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ metadata: { ...metadata, status: 'archived' } })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'done': {
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ processed: true })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'undo_done': {
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ processed: false })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'snooze': {
      if (!snoozed_until) {
        return NextResponse.json({ error: 'snoozed_until is required' }, { status: 400 })
      }
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ metadata: { ...metadata, snoozed_until } })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'unsnooze': {
      const { snoozed_until: _, ...rest } = metadata
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ metadata: rest })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'unarchive': {
      const { status: _s, ...rest } = metadata
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ metadata: rest })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    case 'spam': {
      const { data, error } = await ctx.supabase
        .from('channel_messages')
        .update({ metadata: { ...metadata, status: 'spam' } })
        .eq('id', id)
        .eq('org_id', ctx.orgId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

/**
 * DELETE /api/agent/inbox/[id] — permanently delete a message
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await ctx.supabase
    .from('channel_messages')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ deleted: true })
}
