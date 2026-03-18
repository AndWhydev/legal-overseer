import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { computeScenario, getScenarios } from '@/lib/revenue/scenario-planner'
import { logger } from '@/lib/core/logger'
import type { ScenarioType, ScenarioParams } from '@/lib/revenue/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/scenarios
 * List saved scenarios.
 * Query params: ?status=computed,saved — filter by status
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)
    const statusFilter = url.searchParams.get('status')?.split(',')

    const scenarios = await getScenarios(supabase, orgId, {
      status: statusFilter,
      limit: 20,
    })

    return NextResponse.json({ scenarios, count: scenarios.length })
  } catch (error) {
    logger.error('[api/revenue/scenarios] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 })
  }
}

/**
 * POST /api/revenue/scenarios
 * Create and compute a new scenario.
 *
 * Body: {
 *   name: string,
 *   description?: string,
 *   scenario_type: ScenarioType,
 *   parameters: ScenarioParams,
 *   runs?: number
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const body = await request.json() as {
      name: string
      description?: string
      scenario_type: ScenarioType
      parameters: ScenarioParams
      runs?: number
    }

    if (!body.name || !body.scenario_type || !body.parameters) {
      return NextResponse.json(
        { error: 'Missing required fields: name, scenario_type, parameters' },
        { status: 400 },
      )
    }

    const scenario = await computeScenario(supabase, orgId, {
      name: body.name,
      description: body.description,
      scenarioType: body.scenario_type,
      parameters: body.parameters,
      runs: body.runs,
      createdBy: user.id,
    })

    if (!scenario) {
      return NextResponse.json({ error: 'Failed to compute scenario' }, { status: 500 })
    }

    return NextResponse.json(scenario, { status: 201 })
  } catch (error) {
    logger.error('[api/revenue/scenarios] POST error:', error)
    return NextResponse.json({ error: 'Failed to create scenario' }, { status: 500 })
  }
}
