import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
<<<<<<< HEAD
import { createMeeting, listMeetings, uploadRecording } from '@/lib/meetings'

/**
 * GET /api/meetings — List meetings for the org
=======
import { listMeetings, createMeeting } from '@/lib/meetings/meeting-service'
import type { MeetingType, MeetingStatus } from '@/lib/meetings/types'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/meetings — List meetings for the current org.
 * Query params: limit, offset, meeting_type, status, contact_id
>>>>>>> v1.5-marketing-launch
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
<<<<<<< HEAD

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const url = new URL(request.url)
  const { meetings, total } = await listMeetings(supabase, profile.active_org_id, {
    limit: parseInt(url.searchParams.get('limit') ?? '20'),
    offset: parseInt(url.searchParams.get('offset') ?? '0'),
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    project_id: url.searchParams.get('project_id') ?? undefined,
=======
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (user.user_metadata?.org_id as string) ?? user.id
  const url = new URL(request.url)

  const { meetings, total } = await listMeetings(supabase, orgId, {
    limit: parseInt(url.searchParams.get('limit') || '20'),
    offset: parseInt(url.searchParams.get('offset') || '0'),
    meeting_type: (url.searchParams.get('meeting_type') as MeetingType) || undefined,
    status: (url.searchParams.get('status') as MeetingStatus) || undefined,
    contact_id: url.searchParams.get('contact_id') || undefined,
>>>>>>> v1.5-marketing-launch
  })

  return NextResponse.json({ meetings, total })
}

/**
<<<<<<< HEAD
 * POST /api/meetings — Create meeting + optional file upload
=======
 * POST /api/meetings — Create a new meeting record.
 * Body: { title, meeting_type?, description?, contact_id?, participants?, scheduled_at? }
>>>>>>> v1.5-marketing-launch
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
<<<<<<< HEAD

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })
  const orgId = profile.active_org_id

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // File upload flow
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = (formData.get('title') as string) || 'Untitled Meeting'
    const description = formData.get('description') as string | null
    const participantsJson = formData.get('participants') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    let participants: Array<{ display_name: string; email?: string }> | undefined
    if (participantsJson) {
      try {
        participants = JSON.parse(participantsJson)
      } catch {
        // ignore parse errors
      }
    }

    const meeting = await createMeeting(supabase, orgId, {
      title,
      description: description ?? undefined,
      participants,
    })

    // Upload recording
    const storagePath = await uploadRecording(
      supabase,
      meeting.id,
      orgId,
      file,
      file.type || 'audio/mpeg',
    )

    return NextResponse.json({ meeting: { ...meeting, recording_path: storagePath } }, { status: 201 })
  } else {
    // JSON-only creation (no file yet)
    const body = await request.json()

    const meeting = await createMeeting(supabase, orgId, {
      title: body.title ?? 'Untitled Meeting',
      description: body.description,
      source: body.source,
      started_at: body.started_at,
      participants: body.participants,
      project_id: body.project_id,
      external_id: body.external_id,
      external_url: body.external_url,
    })

    return NextResponse.json({ meeting }, { status: 201 })
  }
=======
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const meeting = await createMeeting(supabase, orgId, {
    title: body.title as string,
    meeting_type: (body.meeting_type as MeetingType) || undefined,
    description: (body.description as string) || undefined,
    contact_id: (body.contact_id as string) || undefined,
    participants: body.participants as Array<{ name: string; email?: string }> || undefined,
    scheduled_at: (body.scheduled_at as string) || undefined,
    created_by: user.id,
  })

  if (!meeting) {
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 })
  }

  return NextResponse.json({ meeting }, { status: 201 })
>>>>>>> v1.5-marketing-launch
}
