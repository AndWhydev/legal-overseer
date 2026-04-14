/**
 * Small pure-function helpers extracted from taor-loop.ts to keep
 * the monster file more testable. No side effects here.
 */

import type { ExecuteToolOptions } from '@/lib/agent/tools'
import type { EngineConfig } from './types'

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
