import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import type { RoleType, ActivityType } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

const VALID_ROLE_TYPES: RoleType[] = ['finance', 'comms', 'sales']
const VALID_ACTIVITY_TYPES: ActivityType[] = ['insight', 'action', 'escalation', 'learning', 'error', 'workflow_step']

/**
 * GET /api/roles/activity
 * Returns unified activity across all roles, sorted by priority/recency.
 * Combines role_activity + approval_queue into a single sorted stream.
 *
 * Query params:
 *   - role_type: filter by role (finance, comms, sales)
 *   - types: comma-separated activity types to include
 *   - limit: max items (default 50, max 200)
 *   - offset: pagination offset
 */
export async function GET(request: NextRequest) {
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
      logger.warn(`[api/roles/activity] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const roleTypeParam = params.get('role_type')
    const typesParam = params.get('types')
    const limitParam = Number(params.get('limit') ?? '50')
    const offsetParam = Number(params.get('offset') ?? '0')

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

    // Validate role_type filter
    if (roleTypeParam && !VALID_ROLE_TYPES.includes(roleTypeParam as RoleType)) {
      return NextResponse.json(
        { error: `Invalid role_type. Valid: ${VALID_ROLE_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    // Validate activity types filter
    let typeFilters: ActivityType[] | undefined
    if (typesParam) {
      const requested = typesParam.split(',').map(t => t.trim()) as ActivityType[]
      const invalid = requested.filter(t => !VALID_ACTIVITY_TYPES.includes(t))
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid activity types: ${invalid.join(', ')}. Valid: ${VALID_ACTIVITY_TYPES.join(', ')}` },
          { status: 400 },
        )
      }
      typeFilters = requested
    }

    // Build activity query
    let activityQuery = supabase
      .from('role_activity')
      .select('*, role_configs!inner(role_type)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (roleTypeParam) {
      activityQuery = activityQuery.eq('role_configs.role_type', roleTypeParam)
    }

    if (typeFilters && typeFilters.length > 0) {
      activityQuery = activityQuery.in('activity_type', typeFilters)
    }

    const { data: activities, error: actError } = await activityQuery

    if (actError) {
      logger.warn(`[api/roles/activity] Failed to fetch activity: ${actError.message}`)
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
    }

    // Flatten role_type from the join
    const items = (activities ?? []).map(a => ({
      id: a.id,
      role_config_id: a.role_config_id,
      role_type: (a.role_configs as any)?.role_type ?? null,
      activity_type: a.activity_type,
      summary: a.summary,
      details: a.details,
      confidence: a.confidence,
      autonomy_mode: a.autonomy_mode,
      reasoning: a.reasoning,
      reversible: a.reversible,
      created_at: a.created_at,
    }))

    return NextResponse.json({ activities: items, count: items.length, offset, limit })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch activity'
    logger.error(`[api/roles/activity] ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
