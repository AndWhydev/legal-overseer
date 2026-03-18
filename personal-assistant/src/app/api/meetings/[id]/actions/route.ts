import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateActionItem, createTasksFromActionItems } from '@/lib/meetings/meeting-service'

/**
 * GET /api/meetings/[id]/actions — List action items for a meeting
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: meetingId } = await params
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

  const { data, error } = await supabase
    .from('meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('org_id', profile.active_org_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ action_items: data })
}

/**
 * PATCH /api/meetings/[id]/actions — Update an action item
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params // consumed but not used — action_item_id in body
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
  if (!body.action_item_id) return NextResponse.json({ error: 'action_item_id required' }, { status: 400 })

  const updated = await updateActionItem(supabase, body.action_item_id, profile.active_org_id, {
    status: body.status,
    title: body.title,
    assignee_name: body.assignee_name,
    due_date: body.due_date,
    priority: body.priority,
  })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ action_item: updated })
}

/**
 * POST /api/meetings/[id]/actions — Create kanban tasks from action items
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: meetingId } = await params
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

  const tasksCreated = await createTasksFromActionItems(supabase, meetingId, profile.active_org_id)

  return NextResponse.json({ tasks_created: tasksCreated })
}
