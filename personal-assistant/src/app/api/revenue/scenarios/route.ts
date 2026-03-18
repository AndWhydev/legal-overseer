import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScenario } from '@/lib/revenue/scenarios'
import { resolveOrgId } from '@/lib/revenue/resolve-org'
import type { ScenarioType } from '@/lib/revenue/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('revenue_scenarios')
      .select('*')
      .eq('org_id', resolved.orgId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ scenarios: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      name,
      scenario_type,
      parameters,
      simulations,
    } = body as {
      name: string
      scenario_type: ScenarioType
      parameters: Record<string, unknown>
      simulations?: number
    }

    if (!name || !scenario_type || !parameters) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validTypes: ScenarioType[] = ['rate_change', 'client_churn', 'new_client', 'capacity_change', 'seasonal_adjustment']
    if (!validTypes.includes(scenario_type)) {
      return NextResponse.json({ error: `Invalid scenario_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const scenario = await runScenario(supabase, resolved.orgId, name, scenario_type, parameters, simulations)

    return NextResponse.json({ scenario })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scenario failed' },
      { status: 500 },
    )
  }
}
