import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeAndStoreCashFlow } from '@/lib/revenue/cash-flow'
import { resolveOrgId } from '@/lib/revenue/resolve-org'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('cash_flow_projections')
      .select('*')
      .eq('org_id', resolved.orgId)
      .order('projection_date', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ projections: data ?? [] })
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

    const projection = await computeAndStoreCashFlow(supabase, resolved.orgId)

    return NextResponse.json({ projection })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Projection failed' },
      { status: 500 },
    )
  }
}
