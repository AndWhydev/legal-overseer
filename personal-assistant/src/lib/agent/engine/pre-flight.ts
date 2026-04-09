/**
 * Pre-flight checks for the agent engine.
 *
 * Runs before the TAOR loop starts:
 * 1. Cost guard — daily budget enforcement
 * 2. Agent kill switch — org-level agents_enabled flag
 * 3. Calibrated thresholds — load from agent_configs if not provided
 *
 * Returns collected events (the caller yields them) instead of yielding
 * directly, so this module stays a pure async function.
 */

import { canProceed } from '@/lib/agent/cost-guard'
import { logAgentRun, estimateRunCost } from '@/lib/agent/run-logger'
import { logger } from '@/lib/core/logger'
import type { EngineConfig, AgentEvent } from './types'

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface PreFlightResult {
  blocked: boolean
  reason?: 'cost_blocked' | 'agents_disabled'
  events: AgentEvent[]
  calibratedThresholds?: EngineConfig['calibratedThresholds']
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

export async function preFlightChecks(
  config: EngineConfig,
  /** Original user message — used for run logging when blocked. */
  message?: string,
): Promise<PreFlightResult> {
  const events: AgentEvent[] = []
  const startTime = Date.now()

  // ── 1. Cost guard ──────────────────────────────────────────────────
  if (!config.skipCostGuard) {
    events.push({ type: 'stage', data: { stage: 'cost_check', status: 'start' } })

    try {
      const budget = await canProceed(config.supabase, config.orgId, config.ltvMultiplier)
      if (!budget.allowed) {
        events.push({
          type: 'cost_blocked',
          data: { spentToday: budget.spentToday, dailyLimit: budget.dailyLimit },
        })
        events.push({ type: 'error', data: budget.reason || 'Daily cost limit reached' })

        // Log the blocked run
        if (config.agentConfigId) {
          await logAgentRun(config.supabase, {
            org_id: config.orgId,
            agent_config_id: config.agentConfigId,
            trigger_type: 'chat',
            trigger_payload: { message },
            status: 'cost_blocked',
            tokens_in: 0,
            tokens_out: 0,
            cost_estimate: 0,
            duration_ms: Date.now() - startTime,
            tool_calls: 0,
            iterations: 0,
            error_message: budget.reason || 'Daily cost limit reached',
          })
        }

        events.push({ type: 'done', data: {} })
        return { blocked: true, reason: 'cost_blocked', events }
      }
    } catch {
      // Cost guard failure should not block execution
      logger.warn('[engine] Cost guard check failed, proceeding anyway')
    }

    events.push({ type: 'stage', data: { stage: 'cost_check', status: 'done', meta: { allowed: true } } })
  }

  // ── 2. Agent kill switch ───────────────────────────────────────────
  const { data: orgRow } = await config.supabase
    .from('organizations')
    .select('agents_enabled')
    .eq('id', config.orgId)
    .single()

  if (orgRow && orgRow.agents_enabled === false) {
    events.push({
      type: 'error',
      data: 'Agent execution is disabled for this organization. Contact your admin to re-enable.',
    })
    events.push({ type: 'done', data: {} })
    return { blocked: true, reason: 'agents_disabled', events }
  }

  // ── 3. Load calibrated thresholds ──────────────────────────────────
  let calibratedThresholds = config.calibratedThresholds
  if (!calibratedThresholds && config.agentConfigId) {
    try {
      const { data: agentCfg } = await config.supabase
        .from('agent_configs')
        .select('calibrated_thresholds')
        .eq('id', config.agentConfigId)
        .single()

      if (agentCfg?.calibrated_thresholds) {
        const ct = agentCfg.calibrated_thresholds as { act: number; ask: number; sampleSize: number }
        if (ct.sampleSize >= 50) {
          calibratedThresholds = ct
        }
      }
    } catch {
      // Non-critical: calibration enhances routing but isn't required
    }
  }

  return { blocked: false, events, calibratedThresholds }
}
