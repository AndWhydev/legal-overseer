import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import type { RoleType, AutonomyLevel } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/roles/status
 * Returns status for all configured roles: enabled, autonomy level,
 * last tick, active workflows, key metrics.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let orgId: string
    try {
      orgId = await getActiveOrgId(supabase, user.id)
    } catch (tenancyError) {
      const msg = tenancyError instanceof Error ? tenancyError.message : 'Unknown tenancy error'
      logger.warn(`[api/roles/status] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    // Fetch all role configs for this org
    const { data: configs, error: configError } = await supabase
      .from('role_configs')
      .select('id, role_type, enabled, autonomy_level, tick_interval_seconds, daily_budget_cents, updated_at')
      .eq('org_id', orgId)
      .order('role_type')

    if (configError) {
      logger.warn(`[api/roles/status] Failed to fetch configs: ${configError.message}`)
      return NextResponse.json({ error: 'Failed to fetch role configs' }, { status: 500 })
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ roles: [], message: 'No roles configured for this organization' })
    }

    // Fetch states for all configs
    const configIds = configs.map(c => c.id)
    const { data: states } = await supabase
      .from('role_states')
      .select('role_config_id, last_tick_at, next_tick_at, version')
      .in('role_config_id', configIds)

    // Fetch active workflow counts per config
    const { data: workflows } = await supabase
      .from('role_workflows')
      .select('role_config_id, status')
      .in('role_config_id', configIds)
      .in('status', ['active', 'pending', 'paused'])

    // Fetch recent activity counts (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentActivity } = await supabase
      .from('role_activity')
      .select('role_config_id, activity_type')
      .in('role_config_id', configIds)
      .gte('created_at', since)

    // Build state map
    const stateMap = new Map((states ?? []).map(s => [s.role_config_id, s]))

    // Build workflow count map
    const workflowMap = new Map<string, number>()
    for (const wf of (workflows ?? [])) {
      workflowMap.set(wf.role_config_id, (workflowMap.get(wf.role_config_id) ?? 0) + 1)
    }

    // Build activity summary map
    const activityMap = new Map<string, { actions: number; insights: number; escalations: number; errors: number }>()
    for (const act of (recentActivity ?? [])) {
      const existing = activityMap.get(act.role_config_id) ?? { actions: 0, insights: 0, escalations: 0, errors: 0 }
      if (act.activity_type === 'action') existing.actions++
      else if (act.activity_type === 'insight') existing.insights++
      else if (act.activity_type === 'escalation') existing.escalations++
      else if (act.activity_type === 'error') existing.errors++
      activityMap.set(act.role_config_id, existing)
    }

    // Build response
    const roles = configs.map(config => {
      const state = stateMap.get(config.id)
      const activity = activityMap.get(config.id) ?? { actions: 0, insights: 0, escalations: 0, errors: 0 }

      return {
        role_config_id: config.id,
        role_type: config.role_type as RoleType,
        enabled: config.enabled,
        autonomy_level: config.autonomy_level as AutonomyLevel,
        tick_interval_seconds: config.tick_interval_seconds,
        daily_budget_cents: config.daily_budget_cents,
        last_tick_at: state?.last_tick_at ?? null,
        next_tick_at: state?.next_tick_at ?? null,
        state_version: state?.version ?? 0,
        active_workflows: workflowMap.get(config.id) ?? 0,
        activity_24h: activity,
        updated_at: config.updated_at,
      }
    })

    return NextResponse.json({ roles })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch role status'
    logger.error(`[api/roles/status] ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
