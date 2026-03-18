import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PricingIntelligence } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/memory-palace/pricing?project_type=...
 * Query pricing history for similar work.
 *
 * Optional params:
 *   - contact_id: filter by client
 *   - limit: max results (default 10)
 *   - compare: if "true", return cross-client comparison
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
    const projectType = searchParams.get('project_type') ?? undefined
    const contactId = searchParams.get('contact_id') ?? undefined
    const limit = parseInt(searchParams.get('limit') ?? '10', 10)
    const compare = searchParams.get('compare') === 'true'

    const pricing = new PricingIntelligence(supabase)

    if (compare && projectType) {
      const comparison = await pricing.getPricingComparison(profile.org_id, projectType)
      return NextResponse.json(comparison)
    }

    const result = await pricing.queryPricing({
      orgId: profile.org_id,
      projectType,
      contactId,
      limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('[api/memory-palace/pricing] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Pricing query failed' }, { status: 500 })
  }
}
