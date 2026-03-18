import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SwarmCoordinator } from '@/lib/swarm'

/**
 * POST /api/swarm/runs/[id]/rollback
 *
 * Rollback all reversible actions from a swarm run.
 */
export async function POST(
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
  const result = await coordinator.rollback(id)

  return NextResponse.json(result)
}
