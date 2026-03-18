import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  analyzeRevenueOpportunities,
  computeClientHealth,
  projectCashFlow,
  assessCapacity,
} from '@/lib/intelligence'
import { logger } from '@/lib/core/logger'

const VALID_METRICS = ['revenue-radar', 'client-health', 'cash-flow', 'capacity'] as const
type MetricName = (typeof VALID_METRICS)[number]

/**
 * GET /api/intelligence/[metric]
 *
 * Returns intelligence metrics for the authenticated user's org.
 * Supported metrics: revenue-radar, client-health, cash-flow, capacity
 *
 * Query params:
 * - months: number (for cash-flow, default 3)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ metric: string }> },
) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No org found' }, { status: 400 })
    }

    const { metric } = await params

    if (!VALID_METRICS.includes(metric as MetricName)) {
      return NextResponse.json(
        { error: `Invalid metric: ${metric}. Valid: ${VALID_METRICS.join(', ')}` },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const orgId = profile.org_id

    let data: unknown

    switch (metric as MetricName) {
      case 'revenue-radar':
        data = await analyzeRevenueOpportunities(supabase, orgId)
        break

      case 'client-health':
        data = await computeClientHealth(supabase, orgId)
        break

      case 'cash-flow': {
        const months = parseInt(searchParams.get('months') ?? '3', 10)
        data = await projectCashFlow(supabase, orgId, Math.min(12, Math.max(1, months)))
        break
      }

      case 'capacity':
        data = await assessCapacity(supabase, orgId)
        break
    }

    return NextResponse.json({ success: true, metric, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[api/intelligence] Error:', { error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
