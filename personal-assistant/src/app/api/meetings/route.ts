import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMeeting, listMeetings, uploadRecording } from '@/lib/meetings'

/**
 * GET /api/meetings — List meetings for the org
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url)
  const { meetings, total } = await listMeetings(supabase, profile.active_org_id, {
    limit: parseInt(url.searchParams.get('limit') ?? '20'),
    offset: parseInt(url.searchParams.get('offset') ?? '0'),
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    project_id: url.searchParams.get('project_id') ?? undefined,
  })

  return NextResponse.json({ meetings, total })
}

/**
 * POST /api/meetings — Create meeting + optional file upload
 */
export async function POST(request: Request) {
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
}
