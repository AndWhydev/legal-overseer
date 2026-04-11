// @ts-nocheck
/**
 * Registry Loader
 *
 * Auto-discovers all agent packages by importing them (triggering self-registration),
 * then provides org-scoped config queries that merge DB overrides over code defaults.
 */

import type { AgentType, AgentRegistryEntry } from '@/lib/bitbit-core'
import { getRegisteredTypes, getAgentConfig, listAgents } from '@/lib/bitbit-core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger';

/**
 * Import all agent packages to trigger self-registration.
 * Each package calls registerAgent() on import.
 *
 * NOTE: Agent packages under @bitbit/* are not yet published.
 * When they exist, add dynamic imports here. For now, agents
 * register via direct imports in their respective route handlers.
 */
export function loadAllAgents(): void {
  const types = getRegisteredTypes()
  logger.info(`[registry] Loaded ${types.length} agents: ${types.join(', ')}`)
}

/**
 * Get a single agent's merged config (code defaults + DB overrides) for an org.
 * Returns null if agent type is not registered.
 */
export async function getAgentWithConfig(
  supabase: SupabaseClient | null,
  type: AgentType,
  orgId: string
): Promise<AgentRegistryEntry | null> {
  if (!supabase) {
    // No DB available — return config from code defaults only
    return getAgentConfig(type, orgId, [])
  }

  const { data, error } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('agent_type', type)
    .eq('org_id', orgId)
    .limit(1)

  if (error) {
    logger.error(`[registry] Failed to fetch config for ${type}:`, error.message)
    // Fall through to code defaults
  }

  return getAgentConfig(type, orgId, data ?? [])
}

/**
 * List all registered agents with their merged configs for an org.
 */
export async function listAgentsWithConfig(
  supabase: SupabaseClient | null,
  orgId: string
): Promise<AgentRegistryEntry[]> {
  const types = getRegisteredTypes()
  if (types.length === 0) return []

  let dbConfigs: Record<string, unknown>[] = []

  if (supabase) {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('org_id', orgId)

    if (error) {
      logger.error('[registry] Failed to fetch agent configs:', error.message)
    } else {
      dbConfigs = data ?? []
    }
  }

  const entries: AgentRegistryEntry[] = []
  for (const type of types) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = getAgentConfig(type, orgId, dbConfigs as any[])
    if (entry) entries.push(entry)
  }

  return entries
}
