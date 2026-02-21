/**
 * Registry Loader
 *
 * Auto-discovers all agent packages by importing them (triggering self-registration),
 * then provides org-scoped config queries that merge DB overrides over code defaults.
 */

import type { AgentType, AgentRegistryEntry } from '@bitbit/core'
import { getRegisteredTypes, getAgentConfig, listAgents } from '@bitbit/core'
import { createClient } from '@/lib/supabase/server'

/**
 * Import all agent packages to trigger self-registration.
 * Each package calls registerAgent() on import.
 * Wrapped in try/catch so missing packages don't break startup.
 */
export function loadAllAgents(): void {
  const imports = [
    () => import('@bitbit/agent-lead-swarm'),
    () => import('@bitbit/agent-invoice-flow'),
    () => import('@bitbit/agent-channel-triage'),
    () => import('@bitbit/agent-client-comms'),
    () => import('@bitbit/agent-proposal-bot'),
    () => import('@bitbit/agent-ad-script-gen'),
    () => import('@bitbit/agent-client-onboarding'),
    () => import('@bitbit/agent-ai-search-optimizer'),
    () => import('@bitbit/agent-tender-hunter'),
    () => import('@bitbit/agent-sentry'),
  ]

  let loaded = 0
  for (const load of imports) {
    try {
      load()
      loaded++
    } catch {
      // Package not yet available — skip silently
    }
  }

  const types = getRegisteredTypes()
  console.log(`[registry] Loaded ${types.length} agents: ${types.join(', ')}`)
}

/**
 * Get a single agent's merged config (code defaults + DB overrides) for an org.
 * Returns null if agent type is not registered.
 */
export async function getAgentWithConfig(
  type: AgentType,
  orgId: string
): Promise<AgentRegistryEntry | null> {
  const supabase = await createClient()
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
    console.error(`[registry] Failed to fetch config for ${type}:`, error.message)
    // Fall through to code defaults
  }

  return getAgentConfig(type, orgId, data ?? [])
}

/**
 * List all registered agents with their merged configs for an org.
 */
export async function listAgentsWithConfig(
  orgId: string
): Promise<AgentRegistryEntry[]> {
  const types = getRegisteredTypes()
  if (types.length === 0) return []

  const supabase = await createClient()
  let dbConfigs: Record<string, unknown>[] = []

  if (supabase) {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('org_id', orgId)

    if (error) {
      console.error('[registry] Failed to fetch agent configs:', error.message)
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
