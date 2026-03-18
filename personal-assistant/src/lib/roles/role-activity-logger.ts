import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityType, AutonomyLevel, RoleActivity } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Log Role Activity
// ---------------------------------------------------------------------------

/**
 * Log role activity with full audit trail.
 *
 * Every role action, insight, escalation, learning, error, and workflow step
 * is recorded with reasoning chain and confidence scores for full auditability.
 *
 * Returns the activity ID for cross-referencing (e.g., linking to approvals).
 */
export async function logRoleActivity(
  supabase: SupabaseClient,
  params: {
    roleConfigId: string
    orgId: string
    activityType: ActivityType
    summary: string
    details?: Record<string, unknown>
    confidence?: number
    autonomyMode?: AutonomyLevel
    reasoning?: string
    reversible?: boolean
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('role_activity')
    .insert({
      role_config_id: params.roleConfigId,
      org_id: params.orgId,
      activity_type: params.activityType,
      summary: params.summary,
      details: params.details ?? {},
      confidence: params.confidence ?? null,
      autonomy_mode: params.autonomyMode ?? null,
      reasoning: params.reasoning ?? null,
      reversible: params.reversible ?? true,
    })
    .select('id')
    .single()

  if (error) {
    logger.warn(`[role-activity] Failed to log activity: ${error.message}`)
    return ''
  }

  return data?.id ?? ''
}

// ---------------------------------------------------------------------------
// Get Role Activity
// ---------------------------------------------------------------------------

/**
 * Get recent activity for a role.
 *
 * Supports filtering by activity types and pagination via limit/offset.
 * Returns newest-first ordering for dashboard display.
 */
export async function getRoleActivity(
  supabase: SupabaseClient,
  roleConfigId: string,
  opts?: {
    limit?: number
    offset?: number
    types?: ActivityType[]
  },
): Promise<RoleActivity[]> {
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  let query = supabase
    .from('role_activity')
    .select('*')
    .eq('role_config_id', roleConfigId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.types && opts.types.length > 0) {
    query = query.in('activity_type', opts.types)
  }

  const { data, error } = await query

  if (error) {
    logger.warn(`[role-activity] Failed to fetch activity: ${error.message}`)
    return []
  }

  return (data ?? []) as RoleActivity[]
}

// ---------------------------------------------------------------------------
// Get Activity Summary (for dashboards)
// ---------------------------------------------------------------------------

/**
 * Get a summary of recent role activity counts by type.
 * Useful for dashboard badges and notification counts.
 */
export async function getRoleActivitySummary(
  supabase: SupabaseClient,
  roleConfigId: string,
  sinceDateIso?: string,
): Promise<Record<ActivityType, number>> {
  const since = sinceDateIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('role_activity')
    .select('activity_type')
    .eq('role_config_id', roleConfigId)
    .gte('created_at', since)

  const summary: Record<ActivityType, number> = {
    insight: 0,
    action: 0,
    escalation: 0,
    learning: 0,
    error: 0,
    workflow_step: 0,
  }

  if (error || !data) {
    logger.warn(`[role-activity] Failed to fetch summary: ${error?.message}`)
    return summary
  }

  for (const row of data) {
    const type = row.activity_type as ActivityType
    if (type in summary) {
      summary[type]++
    }
  }

  return summary
}
