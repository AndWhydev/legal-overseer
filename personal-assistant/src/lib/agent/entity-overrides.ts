import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

/**
 * Entity override record from the entity_overrides table.
 */
export interface EntityOverride {
  id: string
  entity_id: string
  org_id: string
  delegation_mandate: 'standard' | 'supervised' | 'infinite_autopilot'
  ltv_multiplier: number
  iteration_cap: number | null
  budget_preset: 'standard' | 'dynamic_workspace'
  notes: string | null
}

/**
 * Resolved override values ready to merge into EngineConfig.
 * All fields have safe defaults so callers never get null.
 */
export interface ResolvedEntityOverrides {
  delegationMandate: 'standard' | 'supervised' | 'infinite_autopilot'
  ltvMultiplier: number
  iterationCap: number | undefined
  budgetPreset: 'standard' | 'dynamic_workspace'
}

/** Default overrides — equivalent to "no override exists" */
export const DEFAULT_ENTITY_OVERRIDES: ResolvedEntityOverrides = {
  delegationMandate: 'standard',
  ltvMultiplier: 1.0,
  iterationCap: undefined,
  budgetPreset: 'standard',
}

/**
 * Load entity overrides from the database.
 * Returns DEFAULT_ENTITY_OVERRIDES if no override exists, entity_id is null,
 * or the query fails (fail-open — standard entities are never blocked).
 */
export async function resolveEntityOverrides(
  supabase: SupabaseClient,
  orgId: string,
  entityId?: string,
): Promise<ResolvedEntityOverrides> {
  if (!entityId) return { ...DEFAULT_ENTITY_OVERRIDES }

  try {
    const { data, error } = await supabase
      .from('entity_overrides')
      .select('delegation_mandate, ltv_multiplier, iteration_cap, budget_preset')
      .eq('entity_id', entityId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) {
      logger.warn('[entity-overrides] Query failed, using defaults', { error: error.message, entityId, orgId })
      return { ...DEFAULT_ENTITY_OVERRIDES }
    }

    if (!data) return { ...DEFAULT_ENTITY_OVERRIDES }

    return {
      delegationMandate: data.delegation_mandate as ResolvedEntityOverrides['delegationMandate'],
      ltvMultiplier: Number(data.ltv_multiplier) || 1.0,
      iterationCap: data.iteration_cap != null ? Number(data.iteration_cap) : undefined,
      budgetPreset: (data.budget_preset as ResolvedEntityOverrides['budgetPreset']) || 'standard',
    }
  } catch (err) {
    logger.warn('[entity-overrides] Unexpected error, using defaults', { error: String(err), entityId, orgId })
    return { ...DEFAULT_ENTITY_OVERRIDES }
  }
}
