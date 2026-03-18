import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMeeting,
  updateMeeting,
  deleteMeeting,
  getTranscriptSegments,
} from '@/lib/meetings'

/**
 * GET /api/meetings/[id] — Get meeting with relations
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const meeting = await getMeeting(supabase, id, profile.active_org_id)
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Also fetch transcript segments if meeting is ready
  let segments: unknown[] = []
  if (['transcribed', 'processing', 'ready'].includes(meeting.status)) {
    const url = new URL(request.url)
    const includeTranscript = url.searchParams.get('transcript') !== 'false'
    if (includeTranscript) {
      segments = await getTranscriptSegments(supabase, id, profile.active_org_id, {
        limit: parseInt(url.searchParams.get('segment_limit') ?? '500'),
      })
    }
  }

  return NextResponse.json({ meeting, segments })
}

/**
 * PATCH /api/meetings/[id] — Update meeting
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const body = await request.json()
  const updated = await updateMeeting(supabase, id, profile.active_org_id, body)

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ meeting: updated })
}

/**
 * DELETE /api/meetings/[id] — Delete meeting and storage
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const deleted = await deleteMeeting(supabase, id, profile.active_org_id)
  if (!deleted) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
