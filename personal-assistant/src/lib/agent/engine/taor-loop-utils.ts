/**
 * Small pure-function helpers extracted from taor-loop.ts to keep
 * the monster file more testable. No side effects here.
 */

import type { ExecuteToolOptions } from '@/lib/agent/tools'
import type { EngineConfig } from './types'
import type { MandateLevel } from '@/lib/agent/delegation-mandate'

/**
 * Build the `ExecuteToolOptions` passed to every tool invocation from
 * the current `EngineConfig`. Historically this was an inline object
 * literal in taor-loop.ts that silently omitted several fields (including
 * the Phase 43 delegation plumbing). Extracted and centralised so the
 * mapping is testable and all call sites agree.
 *
 * Returns `undefined` when `agentConfigId` is absent — tools run without
 * any confidence routing / approval queue interaction in that mode
 * (used for dev bypass and some sub-agent contexts).
 */
export function buildTaorExecOptions(
  config: EngineConfig & { _spawnDepth?: number },
): ExecuteToolOptions | undefined {
  if (!config.agentConfigId) return undefined

  return {
    agentConfigId: config.agentConfigId,
    orgSettings: config.orgSettings,
    agentType: config.agentType,
    calibratedThresholds: config.calibratedThresholds,
    spawnDepth: config._spawnDepth ?? 0,
    maxSpawnDepth: config.maxDepth ?? 3,
    parentAgentId: config.parentAgentId,
    // Phase 43 delegation plumbing. Without these fields, the autonomy
    // short-circuit and the approval-queue bypass in tools.ts are dead code.
    delegationMandate: config.delegationMandate,
    entityId: config.entityId,
  }
}

/**
 * Merge two sources of entity-level overrides into a config patch.
 *
 * Priority (first-wins):
 *   1. Caller-passed config.delegationMandate (explicit override)
 *   2. Active mandate from `delegation_mandates` (live user-facing state)
 *   3. entity_overrides.delegationMandate (legacy/admin override)
 *
 * Without this merge, a mandate set in turn N via NL activation in step 1c
 * would only exist in `delegation_mandates` and never flow into turn N+1's
 * `config.delegationMandate`, so downstream tools wouldn't see the bypass.
 * Extracted to a pure function for testability.
 */
export function mergeEntityOverrides(
  config: EngineConfig,
  sources: {
    mandateFromMandatesTable?: MandateLevel | null
    overridesFromOverridesTable?: {
      delegationMandate?: EngineConfig['delegationMandate']
      ltvMultiplier?: number
      iterationCap?: number
      budgetPreset?: EngineConfig['budgetPreset']
    }
  },
): EngineConfig {
  const overrides = sources.overridesFromOverridesTable ?? {}
  const mandateFromMandates = sources.mandateFromMandatesTable ?? undefined
  return {
    ...config,
    delegationMandate:
      config.delegationMandate
      ?? mandateFromMandates
      ?? overrides.delegationMandate,
    ltvMultiplier: config.ltvMultiplier ?? overrides.ltvMultiplier,
    iterationCap: config.iterationCap ?? overrides.iterationCap,
    budgetPreset: config.budgetPreset ?? overrides.budgetPreset,
  }
}
