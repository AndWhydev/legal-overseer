import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { updateInsightStatus } from '@/lib/revenue/health-overview'
import { logger } from '@/lib/core/logger'
import type { InsightType, InsightStatus } from '@/lib/revenue/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/insights
 * List revenue insights.
 * Query params:
 *   ?status=active — filter by status (default: active)
 *   ?type=unbilled_work,scope_creep — filter by type
 *   ?severity=high,critical — filter by severity
 *   ?limit=20
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')?.split(',') ?? ['active']
    const types = url.searchParams.get('type')?.split(',') as InsightType[] | undefined
    const severities = url.searchParams.get('severity')?.split(',')
    const limit = parseInt(url.searchParams.get('limit') ?? '20')

    let query = supabase
      .from('revenue_insights')
      .select('*')
      .eq('org_id', orgId)
      .in('status', status)

    if (types && types.length > 0) {
      query = query.in('insight_type', types)
    }

    if (severities && severities.length > 0) {
      query = query.in('severity', severities)
    }

    query = query
      .order('amount_cents', { ascending: false })
      .limit(Math.min(limit, 100))

    const { data, error } = await query

    if (error) {
      logger.error('[api/revenue/insights] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 })
    }

    // Enrich with contact names
    const insights = data ?? []
    const contactIds = [...new Set(insights.map(i => i.contact_id).filter(Boolean))] as string[]
    const contacts = new Map<string, string>()

    if (contactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds)

      for (const c of contactData ?? []) {
        contacts.set(c.id, c.name)
      }
    }

    const enriched = insights.map(i => ({
      ...i,
      contact_name: i.contact_id ? contacts.get(i.contact_id) ?? null : null,
    }))

    // Summary
    const totalAmountCents = enriched.reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)

    return NextResponse.json({
      insights: enriched,
      count: enriched.length,
      total_amount_cents: totalAmountCents,
    })
  } catch (error) {
    logger.error('[api/revenue/insights] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 })
  }
}

/**
 * PATCH /api/revenue/insights
 * Update insight status (acknowledge, action, dismiss).
 *
 * Body: { id: string, status: InsightStatus }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as { id: string; status: InsightStatus }

    if (!body.id || !body.status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const validStatuses: InsightStatus[] = ['acknowledged', 'actioned', 'dismissed']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 },
      )
    }

    const success = await updateInsightStatus(
      supabase,
      body.id,
      body.status as 'acknowledged' | 'actioned' | 'dismissed',
      user.id,
    )

    if (!success) {
      return NextResponse.json({ error: 'Failed to update insight' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('[api/revenue/insights] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update insight' }, { status: 500 })
  }
}
