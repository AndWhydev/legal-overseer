import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { getRevenueHealthOverview, getRevenueRadar } from '@/lib/revenue/health-overview'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/health
 * Returns comprehensive revenue health overview.
 * Query params: ?view=radar for focused recoverable-revenue view.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)
    const view = url.searchParams.get('view')

    if (view === 'radar') {
      const radar = await getRevenueRadar(supabase, orgId)
      return NextResponse.json(radar)
    }

    const overview = await getRevenueHealthOverview(supabase, orgId)
    return NextResponse.json(overview)
  } catch (error) {
    logger.error('[api/revenue/health] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch revenue health' }, { status: 500 })
  }
}
