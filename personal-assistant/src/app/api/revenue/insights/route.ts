import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runInsightScan } from '@/lib/revenue/insights'
import { resolveOrgId } from '@/lib/revenue/resolve-org'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const status = req.nextUrl.searchParams.get('status') ?? 'active'

    let query = supabase
      .from('revenue_insights')
      .select('*')
      .eq('org_id', resolved.orgId)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ insights: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await runInsightScan(supabase, resolved.orgId)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { insight_id, action } = body as { insight_id: string; action: 'acknowledge' | 'act' | 'dismiss' }

    if (!insight_id || !action) {
      return NextResponse.json({ error: 'Missing insight_id or action' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (action === 'acknowledge') {
      updates.status = 'acknowledged'
      updates.acknowledged_at = new Date().toISOString()
    } else if (action === 'act') {
      updates.status = 'acted_on'
      updates.acted_on_at = new Date().toISOString()
    } else if (action === 'dismiss') {
      updates.status = 'dismissed'
    }

    const { error } = await supabase
      .from('revenue_insights')
      .update(updates)
      .eq('id', insight_id)
      .eq('org_id', resolved.orgId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
