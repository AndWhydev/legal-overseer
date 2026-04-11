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

  // Parse and validate limit (1-100, default 20)
  let limit = 20
  const limitParam = url.searchParams.get('limit')
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      limit = parsed
    } else {
      return NextResponse.json({ error: 'limit must be between 1 and 100' }, { status: 400 })
    }
  }

  // Parse and validate offset (non-negative, default 0)
  let offset = 0
  const offsetParam = url.searchParams.get('offset')
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10)
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed
    } else {
      return NextResponse.json({ error: 'offset must be non-negative' }, { status: 400 })
    }
  }

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
