import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listMeetings, createMeeting } from '@/lib/meetings/meeting-service'
import type { MeetingType, MeetingStatus } from '@/lib/meetings/types'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/meetings — List meetings for the current org.
 * Query params: limit, offset, meeting_type, status, contact_id
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
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
  })

  return NextResponse.json({ meetings, total })
}

/**
 * POST /api/meetings — Create a new meeting record.
 * Body: { title, meeting_type?, description?, contact_id?, participants?, scheduled_at? }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
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
}
