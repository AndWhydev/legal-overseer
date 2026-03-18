import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleConfig } from '@/lib/bitbit-core'
import { executeRoleTick, type RoleTickResult } from './role-runtime'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Role Scheduler
// ---------------------------------------------------------------------------

/**
 * Run all scheduled roles that are due for a tick.
 *
 * Analogous to `runScheduledAgents` in the agent scheduler:
 * 1. Query role_configs for enabled roles
 * 2. Join role_states to check last_tick_at + tick_interval
 * 3. Execute role tick with concurrency guard (advisory lock inside executeRoleTick)
 * 4. Return results
 *
 * This is a stateless tick function -- no loop, no sleep.
 * Called by the cron endpoint (Vercel cron or external).
 */
export async function runScheduledRoles(
  supabase: SupabaseClient,
): Promise<RoleTickResult[]> {
  // 1. Fetch enabled role configs
  const { data: configs, error: configError } = await supabase
    .from('role_configs')
    .select(`
      id,
      org_id,
      role_type,
      enabled,
      autonomy_level,
      config,
      tick_interval_seconds,
      daily_budget_cents,
      created_at,
      updated_at
    `)
    .eq('enabled', true)

  if (configError) {
    logger.error('[role-scheduler] Failed to fetch role configs:', configError.message)
    return []
  }

  if (!configs || configs.length === 0) {
    return []
  }

  // 2. Fetch role states to check tick timing
  const configIds = configs.map((c: { id: string }) => c.id)
  const { data: states, error: stateError } = await supabase
    .from('role_states')
    .select('role_config_id, last_tick_at, next_tick_at')
    .in('role_config_id', configIds)

  if (stateError) {
    logger.warn('[role-scheduler] Failed to fetch role states, will proceed for all:', stateError.message)
  }

  // Build lookup: configId -> last_tick_at
  const stateMap = new Map<string, { last_tick_at: string | null; next_tick_at: string | null }>()
  if (states) {
    for (const s of states) {
      stateMap.set(s.role_config_id, {
        last_tick_at: s.last_tick_at,
        next_tick_at: s.next_tick_at,
      })
    }
  }

  const now = Date.now()
  const results: RoleTickResult[] = []

  for (const config of configs) {
    const roleConfig = config as RoleConfig
    const state = stateMap.get(roleConfig.id)

    // 3. Check if tick is due
    if (state?.next_tick_at) {
      const nextTickAt = new Date(state.next_tick_at).getTime()
      if (nextTickAt > now) {
        // Not due yet
        results.push({
          roleType: roleConfig.role_type,
          orgId: roleConfig.org_id,
          triggered: false,
          actionsGenerated: 0,
          insightsGenerated: 0,
          costCents: 0,
          durationMs: 0,
        })
        continue
      }
    } else if (state?.last_tick_at) {
      // Fallback: check last_tick_at + interval
      const lastTickAt = new Date(state.last_tick_at).getTime()
      const intervalMs = roleConfig.tick_interval_seconds * 1000
      if (lastTickAt + intervalMs > now) {
        results.push({
          roleType: roleConfig.role_type,
          orgId: roleConfig.org_id,
          triggered: false,
          actionsGenerated: 0,
          insightsGenerated: 0,
          costCents: 0,
          durationMs: 0,
        })
        continue
      }
    }
    // If no state exists at all, the role has never ticked -- it's due

    // 4. Execute role tick (includes lock, cost guard, pre-screen, evaluation)
    logger.info(`[role-scheduler] Executing tick for ${roleConfig.role_type} (org ${roleConfig.org_id.slice(0, 8)})`)

    try {
      const result = await executeRoleTick(supabase, roleConfig)
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[role-scheduler] Tick failed for ${roleConfig.role_type}: ${message}`)
      results.push({
        roleType: roleConfig.role_type,
        orgId: roleConfig.org_id,
        triggered: false,
        actionsGenerated: 0,
        insightsGenerated: 0,
        costCents: 0,
        durationMs: 0,
        error: message,
      })
    }
  }

  const triggered = results.filter(r => r.triggered).length
  logger.info(`[role-scheduler] Tick complete: ${triggered}/${results.length} roles triggered`)

  return results
}
