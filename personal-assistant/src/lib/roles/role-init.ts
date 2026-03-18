import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleType, RoleConfig, AutonomyLevel } from '@/lib/bitbit-core'
import { getRole } from './role-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Default role configurations
// ---------------------------------------------------------------------------

/**
 * Hardcoded defaults for each role type.
 * Used when no RoleImplementation is registered (bootstrap scenario)
 * or as a fallback for unregistered roles.
 */
const ROLE_DEFAULTS: Record<RoleType, {
  tick_interval_seconds: number
  daily_budget_cents: number
  autonomy_level: AutonomyLevel
  config: Record<string, unknown>
  linked_agent_types: string[]
}> = {
  finance: {
    tick_interval_seconds: 300,  // 5 minutes
    daily_budget_cents: 500,     // $5/day
    autonomy_level: 'copilot',
    config: { auto_categorize: true, invoice_reminders: true },
    linked_agent_types: ['invoice-flow'],
  },
  comms: {
    tick_interval_seconds: 300,
    daily_budget_cents: 500,
    autonomy_level: 'copilot',
    config: { draft_responses: true, summarize_threads: true },
    linked_agent_types: ['channel-triage', 'client-comms'],
  },
  sales: {
    tick_interval_seconds: 600,  // 10 minutes
    daily_budget_cents: 300,     // $3/day
    autonomy_level: 'copilot',
    config: { lead_scoring: true, follow_up_reminders: true },
    linked_agent_types: ['lead-swarm', 'proposal-bot'],
  },
}

// ---------------------------------------------------------------------------
// Role Initialization
// ---------------------------------------------------------------------------

export interface InitializeRoleResult {
  success: boolean
  roleConfigId?: string
  error?: string
  alreadyExists?: boolean
}

/**
 * Initialize a role for an org.
 *
 * Steps:
 * 1. Check if role_config already exists for org+role_type
 * 2. Insert role_configs row with defaults (from registry impl or hardcoded)
 * 3. Insert role_states row with empty state
 * 4. Link existing agent_configs (e.g., finance role links to invoice-flow agent)
 */
export async function initializeRole(
  supabase: SupabaseClient,
  orgId: string,
  roleType: RoleType,
): Promise<InitializeRoleResult> {
  const tag = `[role-init:${roleType}:${orgId.slice(0, 8)}]`

  // 1. Check if already exists
  const { data: existing } = await supabase
    .from('role_configs')
    .select('id, enabled')
    .eq('org_id', orgId)
    .eq('role_type', roleType)
    .maybeSingle()

  if (existing) {
    // Already initialized -- just enable it
    if (!existing.enabled) {
      const { error: enableError } = await supabase
        .from('role_configs')
        .update({ enabled: true })
        .eq('id', existing.id)

      if (enableError) {
        logger.error(`${tag} Failed to enable existing role: ${enableError.message}`)
        return { success: false, error: enableError.message }
      }
    }

    logger.info(`${tag} Role already exists, enabled`)
    return { success: true, roleConfigId: existing.id, alreadyExists: true }
  }

  // 2. Get defaults from registered implementation or hardcoded
  const impl = getRole(roleType)
  const implDefaults = impl?.defaultConfig() ?? {}
  const hardcodedDefaults = ROLE_DEFAULTS[roleType]

  const configValues = {
    org_id: orgId,
    role_type: roleType,
    enabled: true,
    autonomy_level: (implDefaults.autonomy_level as AutonomyLevel) ?? hardcodedDefaults.autonomy_level,
    config: implDefaults.config ?? hardcodedDefaults.config,
    tick_interval_seconds: implDefaults.tick_interval_seconds ?? hardcodedDefaults.tick_interval_seconds,
    daily_budget_cents: implDefaults.daily_budget_cents ?? hardcodedDefaults.daily_budget_cents,
  }

  const { data: created, error: createError } = await supabase
    .from('role_configs')
    .insert(configValues)
    .select('id')
    .single()

  if (createError) {
    logger.error(`${tag} Failed to create role config: ${createError.message}`)
    return { success: false, error: createError.message }
  }

  const roleConfigId = created.id
  logger.info(`${tag} Created role config: ${roleConfigId}`)

  // 3. Create initial state
  const { error: stateError } = await supabase
    .from('role_states')
    .insert({
      role_config_id: roleConfigId,
      org_id: orgId,
      state: {},
      version: 1,
      last_tick_at: null,
      next_tick_at: null,
    })

  if (stateError) {
    logger.warn(`${tag} Failed to create role state (will be created on first tick): ${stateError.message}`)
  }

  // 4. Link existing agent configs
  const linkedAgentTypes = hardcodedDefaults.linked_agent_types
  if (linkedAgentTypes.length > 0) {
    logger.info(`${tag} Role linked to agent types: ${linkedAgentTypes.join(', ')}`)
    // Future: Update agent_configs to reference role_config_id
    // For now, the linkage is implicit via hardcoded mapping
  }

  return { success: true, roleConfigId }
}

// ---------------------------------------------------------------------------
// Role Disable
// ---------------------------------------------------------------------------

export interface DisableRoleResult {
  success: boolean
  error?: string
  notFound?: boolean
}

/**
 * Disable a role for an org (soft disable -- keeps config and state).
 */
export async function disableRole(
  supabase: SupabaseClient,
  orgId: string,
  roleType: RoleType,
): Promise<DisableRoleResult> {
  const tag = `[role-init:${roleType}:${orgId.slice(0, 8)}]`

  const { data: existing } = await supabase
    .from('role_configs')
    .select('id, enabled')
    .eq('org_id', orgId)
    .eq('role_type', roleType)
    .maybeSingle()

  if (!existing) {
    return { success: false, notFound: true, error: `Role ${roleType} not found for org` }
  }

  if (!existing.enabled) {
    logger.info(`${tag} Role already disabled`)
    return { success: true }
  }

  const { error } = await supabase
    .from('role_configs')
    .update({ enabled: false })
    .eq('id', existing.id)

  if (error) {
    logger.error(`${tag} Failed to disable role: ${error.message}`)
    return { success: false, error: error.message }
  }

  logger.info(`${tag} Role disabled`)
  return { success: true }
}
