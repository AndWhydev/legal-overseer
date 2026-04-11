/**
 * GET /api/swarm/[id] — Get swarm run details with steps and messages
 * PATCH /api/swarm/[id] — Cancel or pause a swarm run
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelSwarmRun } from '@/lib/swarm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'No org membership' }, { status: 403 })

  // Load run
  const { data: run, error: runError } = await supabase
    .from('swarm_runs')
    .select('*')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Swarm run not found' }, { status: 404 })
  }

  // Load steps
  const { data: steps } = await supabase
    .from('swarm_steps')
    .select('*')
    .eq('run_id', id)
    .order('created_at', { ascending: true })

  // Load messages
  const { data: messages } = await supabase
    .from('swarm_messages')
    .select('*')
    .eq('run_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    run,
    steps: steps ?? [],
    messages: messages ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'No org membership' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  // Verify ownership
  const { data: run } = await supabase
    .from('swarm_runs')
    .select('id, org_id, status')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!run) {
    return NextResponse.json({ error: 'Swarm run not found' }, { status: 404 })
  }

  if (action === 'cancel') {
    await cancelSwarmRun(supabase, id)
    return NextResponse.json({ success: true, status: 'cancelled' })
  }

  if (action === 'pause') {
    if (run.status !== 'executing') {
      return NextResponse.json({ error: 'Can only pause executing swarms' }, { status: 400 })
    }
    await supabase
      .from('swarm_runs')
      .update({ status: 'paused' })
      .eq('id', id)
    return NextResponse.json({ success: true, status: 'paused' })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}