import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import type { MemoryPalaceStats } from '@/lib/memory-palace'

/**
 * GET /api/memory-palace/stats
 * Returns aggregate memory health metrics for the current org.
 */
export async function GET() {
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

    // Call the stats RPC function
    const { data, error } = await supabase.rpc('memory_palace_stats', {
      p_org_id: profile.org_id,
    })

    if (error) {
      logger.error('[api/memory-palace/stats] RPC failed', { error: error.message })

      // Fallback: manual count
      const [memCount, decCount, patCount] = await Promise.all([
        supabase
          .from('memory_palace_entries')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', profile.org_id)
          .eq('is_active', true),
        supabase
          .from('decision_log')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', profile.org_id)
          .eq('status', 'active'),
        supabase
          .from('memory_patterns')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', profile.org_id)
          .eq('status', 'active'),
      ])

      return NextResponse.json({
        total_memories: memCount.count ?? 0,
        by_category: {},
        avg_confidence: 0,
        decisions_count: decCount.count ?? 0,
        patterns_count: patCount.count ?? 0,
        needing_decay: 0,
        low_confidence: 0,
      } satisfies MemoryPalaceStats)
    }

    return NextResponse.json(data as MemoryPalaceStats)
  } catch (error) {
    logger.error('[api/memory-palace/stats] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Stats failed' }, { status: 500 })
  }
}
