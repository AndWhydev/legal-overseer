import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SwarmCoordinator } from '@/lib/swarm'

/**
 * GET /api/swarm/runs
 *
 * List swarm runs with optional status filtering.
 *
 * Query params:
 * - status?: string (comma-separated: pending,executing,completed,failed)
 * - limit?: number (default 20)
 * - offset?: number (default 0)
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  const coordinator = new SwarmCoordinator(supabase, profile.org_id)

  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim()) as import('@/lib/swarm').SwarmRunStatus[]
    : undefined

  const runs = await coordinator.listRuns({
    status: statuses,
    limit,
    offset,
  })

  return NextResponse.json({ runs, total: runs.length })
}
