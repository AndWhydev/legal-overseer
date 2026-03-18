import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ArchaeologyEngine } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/memory-palace/archaeology?q=...
 * Reconstruct narrative timelines from archived data.
 *
 * Optional params:
 *   - entity_ids: comma-separated entity IDs
 *   - date_from: ISO date
 *   - date_to: ISO date
 *   - max_events: number (default 30)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'No org found' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ error: 'Missing ?q= query parameter' }, { status: 400 })
    }

    const entityIdsParam = searchParams.get('entity_ids')
    const entityIds = entityIdsParam ? entityIdsParam.split(',') : undefined
    const dateFrom = searchParams.get('date_from') ?? undefined
    const dateTo = searchParams.get('date_to') ?? undefined
    const maxEvents = parseInt(searchParams.get('max_events') ?? '30', 10)

    const engine = new ArchaeologyEngine(supabase)
    const result = await engine.excavate({
      orgId: profile.org_id,
      query,
      entityIds,
      dateFrom,
      dateTo,
      maxEvents,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('[api/memory-palace/archaeology] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Archaeology query failed' }, { status: 500 })
  }
}
