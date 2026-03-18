import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { approveFollowUp } from '@/lib/meetings/meeting-service'

/**
 * GET /api/meetings/[id]/follow-ups — List follow-ups for a meeting.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: meetingId } = await params

  const { data, error } = await supabase
    .from('meeting_follow_ups')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ follow_ups: data || [] })
}

/**
 * PATCH /api/meetings/[id]/follow-ups — Approve or update a follow-up.
 * Body: { follow_up_id, action: 'approve' | 'edit', body?: string, subject?: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params // validate route

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const followUpId = body.follow_up_id as string
  if (!followUpId) {
    return NextResponse.json({ error: 'follow_up_id is required' }, { status: 400 })
  }

  const action = body.action as string

  if (action === 'approve') {
    const success = await approveFollowUp(supabase, followUpId, user.id)
    if (!success) {
      return NextResponse.json({ error: 'Failed to approve follow-up' }, { status: 500 })
    }
    return NextResponse.json({ success: true, status: 'approved' })
  }

  if (action === 'edit') {
    const updates: Record<string, unknown> = {}
    if (body.body) updates.body = body.body
    if (body.subject) updates.subject = body.subject

    const { error } = await supabase
      .from('meeting_follow_ups')
      .update(updates)
      .eq('id', followUpId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'action must be "approve" or "edit"' }, { status: 400 })
}
