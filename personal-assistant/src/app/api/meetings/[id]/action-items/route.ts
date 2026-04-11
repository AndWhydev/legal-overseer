import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateActionItemStatus } from '@/lib/meetings/meeting-service'
import { convertActionItemsToTasks } from '@/lib/meetings/ai-extraction'
import { getActiveOrgId } from '@/lib/tenancy'

/**
 * GET /api/meetings/[id]/action-items — List action items for a meeting.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { id: meetingId } = await params

  // Verify meeting belongs to user's org
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ action_items: data || [] })
}

/**
 * PATCH /api/meetings/[id]/action-items — Update an action item.
 * Body: { action_item_id, status?, task_id? }
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

  const actionItemId = body.action_item_id as string
  if (!actionItemId) {
    return NextResponse.json({ error: 'action_item_id is required' }, { status: 400 })
  }

  const success = await updateActionItemStatus(
    supabase,
    actionItemId,
    (body.status as string) || 'pending',
    body.task_id as string | undefined
  )

  if (!success) {
    return NextResponse.json({ error: 'Failed to update action item' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * POST /api/meetings/[id]/action-items — Convert action items to kanban tasks.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: meetingId } = await params
  const orgId = await getActiveOrgId(supabase, user.id)

  // Verify meeting belongs to user's org
  const { data: meeting } = await supabase
    .from('meetings')
    .select('title')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tasksCreated = await convertActionItemsToTasks(
    supabase,
    orgId,
    meetingId,
    meeting?.title || 'Untitled Meeting'
  )

  return NextResponse.json({ tasks_created: tasksCreated })
}
