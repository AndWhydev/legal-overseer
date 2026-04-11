import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { getClientScores, getAtRiskClients } from '@/lib/revenue/client-scoring'
import { analyzePaymentPattern } from '@/lib/revenue/collection-engine'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/clients
 * Returns ranked client revenue scores.
 * Query params:
 *   ?risk=high,critical — filter by risk level
 *   ?limit=10 — max results
 *   ?at_risk=true — shortcut for high+critical risk only
 *   ?payment_pattern=<contact_id> — get payment pattern for specific client
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)

    // Payment pattern for specific client
    const paymentPatternId = url.searchParams.get('payment_pattern')
    if (paymentPatternId) {
      const pattern = await analyzePaymentPattern(supabase, orgId, paymentPatternId)
      if (!pattern) return NextResponse.json({ error: 'No payment data found' }, { status: 404 })
      return NextResponse.json(pattern)
    }

    // At-risk shortcut
    if (url.searchParams.get('at_risk') === 'true') {
      const clients = await getAtRiskClients(supabase, orgId)
      return NextResponse.json({ clients, count: clients.length })
    }

    // General client scores
    const riskFilter = url.searchParams.get('risk')?.split(',') as Array<'low' | 'medium' | 'high' | 'critical'> | undefined
    const limit = parseInt(url.searchParams.get('limit') ?? '50')

    const clients = await getClientScores(supabase, orgId, {
      limit: Math.min(limit, 100),
      riskFilter,
    })

    // Enrich with contact names
    if (clients.length > 0) {
      const contactIds = clients.map(c => c.contact_id)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds)

      const nameMap = new Map((contacts ?? []).map(c => [c.id, c.name]))
      const enriched = clients.map(c => ({
        ...c,
        contact_name: nameMap.get(c.contact_id) ?? 'Unknown',
      }))

      return NextResponse.json({ clients: enriched, count: enriched.length })
    }

    return NextResponse.json({ clients: [], count: 0 })
  } catch (error) {
    logger.error('[api/revenue/clients] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch client scores' }, { status: 500 })
  }
}
