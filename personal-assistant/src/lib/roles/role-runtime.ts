import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleConfig, RoleState, RoleType, AutonomyLevel } from '@/lib/bitbit-core'
import { getRole, type RoleImplementation, type RoleEvaluation } from './role-registry'
import { canProceed } from '@/lib/agent/cost-guard'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleTickResult {
  roleType: RoleType
  orgId: string
  triggered: boolean
  actionsGenerated: number
  insightsGenerated: number
  costCents: number
  durationMs: number
  error?: string
}

export interface RoleContext {
  config: RoleConfig
  state: RoleState
  supabase: SupabaseClient
  orgId: string
  autonomyLevel: AutonomyLevel
}

// ---------------------------------------------------------------------------
// Advisory Lock — prevents concurrent ticks on the same role config
// ---------------------------------------------------------------------------

/**
 * Derive a stable int4 lock key from a UUID.
 * We hash the UUID to an int4 range using the first 8 hex chars.
 */
function lockKeyFromId(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 8)
  // Parse as unsigned then fit into signed int32
  return (parseInt(hex, 16) | 0)
}

/**
 * Acquire a Postgres advisory lock (session-level, non-blocking).
 * Returns true if lock acquired, false if another session holds it.
 */
export async function acquireRoleLock(
  supabase: SupabaseClient,
  roleConfigId: string,
): Promise<boolean> {
  const lockKey = lockKeyFromId(roleConfigId)
  const { data, error } = await supabase.rpc('pg_try_advisory_lock', {
    lock_key: lockKey,
  }).maybeSingle()

  if (error) {
    // If RPC doesn't exist, fall back to raw SQL
    const { data: rawData, error: rawError } = await supabase
      .from('role_configs')
      .select('id')
      .limit(0)

    // Try raw query approach
    const { data: lockData, error: lockError } = await supabase.rpc(
      'advisory_lock_try',
      { key: lockKey },
    ).maybeSingle()

    if (lockError) {
      // Last resort: log warning and proceed (optimistic — version check is the safety net)
      logger.warn(`[role-runtime] Could not acquire advisory lock for ${roleConfigId}, proceeding with optimistic concurrency only`)
      return true
    }

    return lockData === true
  }

  return data === true
}

/**
 * Release the advisory lock for a role config.
 */
export async function releaseRoleLock(
  supabase: SupabaseClient,
  roleConfigId: string,
): Promise<void> {
  const lockKey = lockKeyFromId(roleConfigId)
  try {
    await supabase.rpc('pg_advisory_unlock', { lock_key: lockKey }).maybeSingle()
  } catch {
    // Best-effort release — Postgres auto-releases on session end
    logger.warn(`[role-runtime] Failed to release advisory lock for ${roleConfigId}`)
  }
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

/**
 * Load role state for a given config. Creates a new state row if one
 * does not exist yet (first tick after role enablement).
 */
export async function loadRoleState(
  supabase: SupabaseClient,
  roleConfigId: string,
  orgId: string,
): Promise<RoleState> {
  const { data: existing, error } = await supabase
    .from('role_states')
    .select('*')
    .eq('role_config_id', roleConfigId)
    .single()

  if (existing && !error) {
    return existing as RoleState
  }

  // Create initial state
  const { data: created, error: createError } = await supabase
    .from('role_states')
    .insert({
      role_config_id: roleConfigId,
      org_id: orgId,
      state: {},
      version: 1,
      last_tick_at: null,
      next_tick_at: null,
    })
    .select('*')
    .single()

  if (createError) {
    // Race: another tick may have created it — try read again
    const { data: retry, error: retryError } = await supabase
      .from('role_states')
      .select('*')
      .eq('role_config_id', roleConfigId)
      .single()

    if (retryError || !retry) {
      throw new Error(`Failed to load or create role state for config ${roleConfigId}: ${createError.message}`)
    }
    return retry as RoleState
  }

  return created as RoleState
}

/**
 * Save role state with optimistic concurrency control.
 * The version column is incremented atomically; if the current DB version
 * does not match the expected version, a conflict error is thrown.
 */
export async function saveRoleState(
  supabase: SupabaseClient,
  roleState: RoleState,
): Promise<RoleState> {
  const expectedVersion = roleState.version

  const { data, error } = await supabase
    .from('role_states')
    .update({
      state: roleState.state,
      version: expectedVersion + 1,
      last_tick_at: roleState.last_tick_at,
      next_tick_at: roleState.next_tick_at,
    })
    .eq('id', roleState.id)
    .eq('version', expectedVersion) // optimistic concurrency check
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `Optimistic concurrency conflict: role_state ${roleState.id} version mismatch ` +
      `(expected ${expectedVersion}). Another tick may have modified state.`,
    )
  }

  return data as RoleState
}

// ---------------------------------------------------------------------------
// Activity Logging
// ---------------------------------------------------------------------------

async function logRoleActivity(
  supabase: SupabaseClient,
  roleConfigId: string,
  orgId: string,
  activityType: string,
  summary: string,
  details: Record<string, unknown> = {},
  autonomyMode?: AutonomyLevel,
  confidence?: number,
): Promise<void> {
  const { error } = await supabase.from('role_activity').insert({
    role_config_id: roleConfigId,
    org_id: orgId,
    activity_type: activityType,
    summary,
    details,
    autonomy_mode: autonomyMode ?? null,
    confidence: confidence ?? null,
    reversible: true,
  })

  if (error) {
    logger.warn(`[role-runtime] Failed to log activity: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Tick Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single role tick.
 *
 * Flow:
 * 1. Acquire advisory lock (skip if locked)
 * 2. Load persistent state
 * 3. Cost guard check
 * 4. Haiku pre-screen: "Has anything changed?" (delegates to role impl)
 * 5. Execute role-specific evaluation
 * 6. Save state with optimistic concurrency
 * 7. Log activity
 * 8. Release lock
 *
 * Lock is released in finally block to ensure cleanup on errors.
 */
export async function executeRoleTick(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
): Promise<RoleTickResult> {
  const startMs = Date.now()
  const tag = `[role-tick:${roleConfig.role_type}:${roleConfig.org_id.slice(0, 8)}]`
  let lockAcquired = false

  try {
    // 1. Acquire advisory lock
    lockAcquired = await acquireRoleLock(supabase, roleConfig.id)
    if (!lockAcquired) {
      logger.info(`${tag} Skipped — another tick is running (lock held)`)
      return {
        roleType: roleConfig.role_type,
        orgId: roleConfig.org_id,
        triggered: false,
        actionsGenerated: 0,
        insightsGenerated: 0,
        costCents: 0,
        durationMs: Date.now() - startMs,
      }
    }

    // 2. Load persistent state
    const state = await loadRoleState(supabase, roleConfig.id, roleConfig.org_id)

    // 3. Cost guard check
    const costCheck = await canProceed(supabase, roleConfig.org_id)
    if (!costCheck.allowed) {
      logger.warn(`${tag} Cost guard halted tick: ${costCheck.reason}`)
      return {
        roleType: roleConfig.role_type,
        orgId: roleConfig.org_id,
        triggered: false,
        actionsGenerated: 0,
        insightsGenerated: 0,
        costCents: 0,
        durationMs: Date.now() - startMs,
        error: costCheck.reason,
      }
    }

    // 4. Get role implementation
    const impl = getRole(roleConfig.role_type)
    if (!impl) {
      logger.warn(`${tag} No implementation registered for role type: ${roleConfig.role_type}`)
      return {
        roleType: roleConfig.role_type,
        orgId: roleConfig.org_id,
        triggered: false,
        actionsGenerated: 0,
        insightsGenerated: 0,
        costCents: 0,
        durationMs: Date.now() - startMs,
        error: `No implementation for ${roleConfig.role_type}`,
      }
    }

    // Build context
    const ctx: RoleContext = {
      config: roleConfig,
      state,
      supabase,
      orgId: roleConfig.org_id,
      autonomyLevel: roleConfig.autonomy_level,
    }

    // 5. Haiku pre-screen: has anything changed since last tick?
    const hasChanges = await impl.hasChanges(ctx)
    if (!hasChanges) {
      logger.info(`${tag} Pre-screen: no changes since last tick, skipping`)

      // Update last_tick_at even when skipping (so we don't re-check too soon)
      const now = new Date().toISOString()
      state.last_tick_at = now
      state.next_tick_at = new Date(
        Date.now() + roleConfig.tick_interval_seconds * 1000,
      ).toISOString()
      await saveRoleState(supabase, state)

      return {
        roleType: roleConfig.role_type,
        orgId: roleConfig.org_id,
        triggered: false,
        actionsGenerated: 0,
        insightsGenerated: 0,
        costCents: 0,
        durationMs: Date.now() - startMs,
      }
    }

    // 6. Execute role-specific evaluation
    logger.info(`${tag} Evaluating...`)
    const evaluation: RoleEvaluation = await impl.evaluate(ctx)

    // 7. Apply state updates from evaluation
    const now = new Date().toISOString()
    state.state = {
      ...state.state,
      ...evaluation.stateUpdates,
    }
    state.last_tick_at = now
    state.next_tick_at = new Date(
      Date.now() + roleConfig.tick_interval_seconds * 1000,
    ).toISOString()

    const savedState = await saveRoleState(supabase, state)

    // 8. Log activity for actions
    for (const action of evaluation.actions) {
      await logRoleActivity(
        supabase,
        roleConfig.id,
        roleConfig.org_id,
        'action',
        action.summary,
        { type: action.type, payload: action.payload, confidence: action.confidence, reversible: action.reversible },
        roleConfig.autonomy_level,
        action.confidence,
      )
    }

    // Log activity for insights
    for (const insight of evaluation.insights) {
      await logRoleActivity(
        supabase,
        roleConfig.id,
        roleConfig.org_id,
        'insight',
        insight.summary,
        { ...insight.details, priority: insight.priority },
        roleConfig.autonomy_level,
      )
    }

    // Log tick summary
    await logRoleActivity(
      supabase,
      roleConfig.id,
      roleConfig.org_id,
      'action',
      `Tick completed: ${evaluation.actions.length} actions, ${evaluation.insights.length} insights`,
      {
        actions: evaluation.actions.length,
        insights: evaluation.insights.length,
        workflowsStarted: evaluation.workflowsToStart.length,
        durationMs: Date.now() - startMs,
      },
      roleConfig.autonomy_level,
    )

    logger.info(
      `${tag} Complete: ${evaluation.actions.length} actions, ${evaluation.insights.length} insights (${Date.now() - startMs}ms)`,
    )

    return {
      roleType: roleConfig.role_type,
      orgId: roleConfig.org_id,
      triggered: true,
      actionsGenerated: evaluation.actions.length,
      insightsGenerated: evaluation.insights.length,
      costCents: 0, // Will be populated when Haiku pre-screen is wired
      durationMs: Date.now() - startMs,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Tick failed: ${message}`)

    // Log error activity
    try {
      await logRoleActivity(
        supabase,
        roleConfig.id,
        roleConfig.org_id,
        'error',
        `Tick failed: ${message}`,
        { error: message, stack: err instanceof Error ? err.stack : undefined },
        roleConfig.autonomy_level,
      )
    } catch {
      // Best-effort error logging
    }

    return {
      roleType: roleConfig.role_type,
      orgId: roleConfig.org_id,
      triggered: false,
      actionsGenerated: 0,
      insightsGenerated: 0,
      costCents: 0,
      durationMs: Date.now() - startMs,
      error: message,
    }
  } finally {
    // Always release lock
    if (lockAcquired) {
      await releaseRoleLock(supabase, roleConfig.id)
    }
  }
}
