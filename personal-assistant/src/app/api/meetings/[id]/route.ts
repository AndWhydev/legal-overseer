import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMeetingWithDetails } from '@/lib/meetings/meeting-service'

/**
 * GET /api/meetings/[id] — Get meeting with full details.
 * Returns meeting record + participants, transcript segments, action items, follow-ups.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const meeting = await getMeetingWithDetails(supabase, id)

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  return NextResponse.json({ meeting })
}

/**
 * PATCH /api/meetings/[id] — Update meeting metadata.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only allow updating safe fields
  const allowedFields = ['title', 'description', 'meeting_type', 'contact_id', 'scheduled_at']
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ meeting: data })
}

/**
 * DELETE /api/meetings/[id] — Delete a meeting and all related data.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Get recording path for cleanup
  const { data: meeting } = await supabase
    .from('meetings')
    .select('recording_path')
    .eq('id', id)
    .single()

  // Delete meeting (cascades to participants, segments, action items, follow-ups)
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Clean up storage
  if (meeting?.recording_path) {
    await supabase.storage.from('recordings').remove([meeting.recording_path])
  }

  return NextResponse.json({ success: true })
}
