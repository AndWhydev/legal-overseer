import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCalibrationStatus, type CalibrationStatus } from '@/lib/intelligence/confidence-calibrator'
import { AGENT_THRESHOLDS, DEFAULT_THRESHOLDS } from '@/lib/agent/confidence-router'

/**
 * GET /api/confidence/calibration
 *
 * Returns confidence calibration status for the current org.
 * Shows per-agent thresholds, sample sizes, and approval rate trends.
 * Used by trust/calibration dashboard.
 */
export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No profile found' }, { status: 400 })
  }

  try {
    // Get all agent configs for this org
    const { data: configs } = await supabase
      .from('agent_configs')
      .select('agent_type')
      .eq('org_id', profile.org_id)
      .eq('enabled', true)

    const agentTypes = [...new Set((configs ?? []).map(c => c.agent_type))]

    const calibrations: CalibrationStatus[] = []

    for (const agentType of agentTypes) {
      const staticThresholds = AGENT_THRESHOLDS[agentType] ?? DEFAULT_THRESHOLDS
      const status = await getCalibrationStatus(
        supabase,
        profile.org_id,
        agentType,
        staticThresholds,
      )
      calibrations.push(status)
    }

    return NextResponse.json({
      orgId: profile.org_id,
      calibrations,
      summary: {
        totalAgents: agentTypes.length,
        calibratedAgents: calibrations.filter(c => c.isCalibrated).length,
        totalOutcomes: calibrations.reduce((sum, c) => sum + c.totalOutcomes, 0),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch calibration status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
