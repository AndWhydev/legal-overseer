import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

/**
 * GET /api/relationships/health
 *
 * Returns all contacts sorted by relationship health, with cold ones highlighted.
 * Uses cached scores from the daily cron (no live recomputation).
 *
 * Query params:
 *   - limit: number (default 50)
 *   - offset: number (default 0)
 *   - filter: 'cold' | 'declining' | 'all' (default 'all')
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let orgId: string
  try {
    orgId = await getActiveOrgId(supabase, user.id)
  } catch {
    return NextResponse.json({ error: 'No active org' }, { status: 400 })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const filter = url.searchParams.get('filter') ?? 'all'

  let query = supabase
    .from('contacts')
    .select(
      'id, name, type, relationship_strength, relationship_trend, last_interaction_at, lifetime_value, relationship_scored_at',
    )
    .eq('org_id', orgId)
    .not('relationship_strength', 'is', null)
    .order('relationship_strength', { ascending: true })
    .range(offset, offset + Math.max(limit - 1, 0))

  if (filter === 'cold') {
    query = query.eq('relationship_trend', 'cold')
  } else if (filter === 'declining') {
    query = query.in('relationship_trend', ['declining', 'cold'])
  }

  const { data: contacts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Separate cold contacts for highlighting
  const cold = (contacts ?? []).filter((c) => c.relationship_trend === 'cold')
  const declining = (contacts ?? []).filter(
    (c) => c.relationship_trend === 'declining',
  )

  return NextResponse.json({
    contacts: contacts ?? [],
    summary: {
      total: (contacts ?? []).length,
      cold: cold.length,
      declining: declining.length,
      healthy: (contacts ?? []).length - cold.length - declining.length,
    },
  })
}
