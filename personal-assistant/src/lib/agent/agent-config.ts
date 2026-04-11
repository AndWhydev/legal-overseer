/**
 * Default agent config resolver.
 *
 * Resolves the default 'assistant' agent_config_id for an org so that
 * every conversation entry point can pass it to the engine and enable
 * agent_runs logging.
 *
 * Uses a per-org in-memory cache to avoid repeated DB lookups within
 * a single serverless instance lifetime.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

const cache = new Map<string, string>()

/**
 * Resolve the default agent_config_id for an org.
 *
 * Looks up the first active 'assistant' config for the given org.
 * Returns null if no config exists (logging will be skipped gracefully).
 */
export async function getDefaultAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const cached = cache.get(orgId)
  if (cached) return cached

  try {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('id')
      .eq('org_id', orgId)
      .eq('agent_type', 'assistant')
      .eq('enabled', true)
      .limit(1)
      .single()

    if (error) {
      // Table may not exist yet or no config seeded — not fatal
      logger.debug('[agent-config] Could not resolve default config', {
        orgId,
        error: error.message,
      })
      return null
    }

    if (data?.id) {
      cache.set(orgId, data.id)
      return data.id
    }

    return null
  } catch (err) {
    logger.debug('[agent-config] Unexpected error resolving config', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Clear the cached config for an org (e.g. after config changes).
 */
export function clearAgentConfigCache(orgId?: string): void {
  if (orgId) {
    cache.delete(orgId)
  } else {
    cache.clear()
  }
}
