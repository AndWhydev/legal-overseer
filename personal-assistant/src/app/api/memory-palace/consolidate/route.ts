import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ConsolidationPipeline } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/memory-palace/consolidate
 * Trigger the consolidation pipeline: decay, merge, promote, archive.
 *
 * This endpoint is intended for cron/edge-function invocation.
 * It is also available for manual triggering via the dashboard.
 */
export async function POST() {
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

    const pipeline = new ConsolidationPipeline(supabase)
    const report = await pipeline.runForOrg(profile.org_id)

    logger.info('[api/memory-palace/consolidate] Pipeline completed', report)

    return NextResponse.json({ report })
  } catch (error) {
    logger.error('[api/memory-palace/consolidate] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Consolidation failed' }, { status: 500 })
  }
}
