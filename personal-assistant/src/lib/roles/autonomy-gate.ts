import type { AutonomyLevel } from '@/lib/bitbit-core'
import type { RoleAction } from './role-registry'
import {
  routeAgentAction,
  type ConfidenceRoutingResult,
  type ConfidenceThresholds,
} from '@/lib/agent/confidence-router'
import type { CalibratedThresholds } from '@/lib/intelligence/confidence-calibrator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateDecision = 'execute' | 'queue_approval' | 'log_insight' | 'escalate'

export interface GateResult {
  decision: GateDecision
  reasoning: string
  autonomyLevel: AutonomyLevel
  confidenceRouting?: ConfidenceRoutingResult // only for autopilot
}

// ---------------------------------------------------------------------------
// Autonomy Gate
// ---------------------------------------------------------------------------

/**
 * Route a role action through the autonomy gate.
 *
 * The autonomy gate sits between role evaluation and action execution.
 * It adds a layer BEFORE confidence routing based on the role's autonomy level:
 *
 * - Observer:  always log_insight (never act, never queue)
 * - Co-pilot:  always queue_approval (regardless of confidence)
 * - Autopilot: delegate to confidence routing
 *              act -> execute, ask -> queue_approval, escalate -> escalate
 *
 * Key insight: Autopilot doesn't skip confidence routing -- it just removes
 * the "always ask" gate. The existing confidence routing still protects
 * against low-confidence autonomous actions.
 */
export function routeThroughAutonomyGate(
  action: RoleAction,
  autonomyLevel: AutonomyLevel,
  agentConfig?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
  orgSettings?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
  agentType?: string,
  calibratedThresholds?: CalibratedThresholds | null,
): GateResult {
  switch (autonomyLevel) {
    case 'observer':
      return {
        decision: 'log_insight',
        reasoning: `Observer mode: logging "${action.summary}" as insight (no action taken)`,
        autonomyLevel,
      }

    case 'copilot':
      return {
        decision: 'queue_approval',
        reasoning: `Co-pilot mode: queuing "${action.summary}" for approval (confidence ${action.confidence.toFixed(2)})`,
        autonomyLevel,
      }

    case 'autopilot': {
      // Delegate to existing confidence routing
      const calibrated = calibratedThresholds
        ? { act: calibratedThresholds.act, ask: calibratedThresholds.ask, sampleSize: calibratedThresholds.sampleSize }
        : null

      const routing = routeAgentAction(
        action.confidence,
        agentConfig,
        orgSettings,
        agentType,
        calibrated,
      )

      // Map confidence decisions to gate decisions
      const decisionMap: Record<string, GateDecision> = {
        act: 'execute',
        ask: 'queue_approval',
        escalate: 'escalate',
      }

      const decision = decisionMap[routing.decision] ?? 'escalate'

      return {
        decision,
        reasoning: `Autopilot mode: confidence routing -> ${routing.decision} (${routing.reasoning})`,
        autonomyLevel,
        confidenceRouting: routing,
      }
    }

    default: {
      // Defensive: unknown autonomy level -> queue for approval
      return {
        decision: 'queue_approval',
        reasoning: `Unknown autonomy level "${autonomyLevel}": defaulting to queue_approval for safety`,
        autonomyLevel,
      }
    }
  }
}
