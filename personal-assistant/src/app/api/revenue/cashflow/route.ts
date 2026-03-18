import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { getLatestProjections } from '@/lib/revenue/cashflow-engine'
import { getSnapshotHistory } from '@/lib/revenue/snapshot-engine'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/cashflow
 * Returns cash flow projections and snapshot history.
 * Query params:
 *   ?history=monthly&limit=12 — get snapshot history for charting
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)
    const historyType = url.searchParams.get('history')
    const limit = parseInt(url.searchParams.get('limit') ?? '12')

    if (historyType) {
      const periodType = historyType as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
      const history = await getSnapshotHistory(supabase, orgId, periodType, Math.min(limit, 36))
      return NextResponse.json({ history, count: history.length })
    }

    const projections = await getLatestProjections(supabase, orgId)

    // Also get current month snapshot for context
    const { data: currentSnapshot } = await supabase
      .from('revenue_snapshots')
      .select('*')
      .eq('org_id', orgId)
      .eq('period_type', 'monthly')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      projections,
      current_snapshot: currentSnapshot,
    })
  } catch (error) {
    logger.error('[api/revenue/cashflow] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch cash flow data' }, { status: 500 })
  }
}
