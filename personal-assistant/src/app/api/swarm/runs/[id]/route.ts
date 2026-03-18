import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SwarmCoordinator } from '@/lib/swarm'

/**
 * GET /api/swarm/runs/[id]
 *
 * Get a swarm run with all steps and inter-agent messages.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const { id } = await params
  const coordinator = new SwarmCoordinator(supabase, profile.org_id)
  const result = await coordinator.getRun(id)

  if (!result) {
    return NextResponse.json({ error: 'Swarm run not found' }, { status: 404 })
  }

  return NextResponse.json(result)
}
