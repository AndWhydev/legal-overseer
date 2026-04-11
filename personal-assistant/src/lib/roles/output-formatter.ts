import type { RoleAction } from './role-registry'
import type { GateResult } from './autonomy-gate'

// ---------------------------------------------------------------------------
// Output Formatting Per Autonomy Level
// ---------------------------------------------------------------------------

/**
 * Format role activity output based on autonomy level.
 *
 * Different autonomy levels produce different output for the same action:
 *
 * - Observer:  "Finance noticed: X. Suggested action: Y"
 *              (passive observation, no action taken)
 *
 * - Co-pilot:  "Finance recommends: Y. Approval needed."
 *              (creates draft with context for one-tap approval)
 *
 * - Autopilot: "Finance did X (confidence 0.94)"
 *              (reports what was done, post-hoc)
 */
export function formatActivityForAutonomy(
  action: RoleAction,
  gateResult: GateResult,
  executionResult?: unknown,
): { summary: string; details: Record<string, unknown> } {
  const confidencePercent = Math.round(action.confidence * 100)

  switch (gateResult.autonomyLevel) {
    case 'observer': {
      // Passive observation: "Finance noticed X. Suggested action: Y"
      const summary = `Noticed: ${action.summary}. Suggested action: ${action.type}`
      return {
        summary,
        details: {
          mode: 'observer',
          observation: action.summary,
          suggested_action: action.type,
          suggested_payload: action.payload,
          confidence: action.confidence,
          note: 'No action taken (observer mode)',
        },
      }
    }

    case 'copilot': {
      // Draft for approval: "Finance recommends: Y. Approval needed."
      const summary = `Recommends: ${action.summary} (${confidencePercent}% confidence). Approval needed.`
      return {
        summary,
        details: {
          mode: 'copilot',
          recommendation: action.summary,
          action_type: action.type,
          action_payload: action.payload,
          confidence: action.confidence,
          reversible: action.reversible,
          approval_required: true,
        },
      }
    }

    case 'autopilot': {
      // Post-hoc report based on what the gate decided
      if (gateResult.decision === 'execute') {
        const summary = `Executed: ${action.summary} (${confidencePercent}% confidence)`
        return {
          summary,
          details: {
            mode: 'autopilot',
            action_taken: action.summary,
            action_type: action.type,
            confidence: action.confidence,
            execution_result: executionResult ?? null,
            auto_executed: true,
          },
        }
      }

      if (gateResult.decision === 'queue_approval') {
        // Autopilot but confidence too low — queued
        const summary = `Queued for approval: ${action.summary} (${confidencePercent}% confidence — below auto-execute threshold)`
        return {
          summary,
          details: {
            mode: 'autopilot',
            action_queued: action.summary,
            action_type: action.type,
            confidence: action.confidence,
            reason: 'Below auto-execute threshold',
            approval_required: true,
          },
        }
      }

      // Escalated
      const summary = `Escalated: ${action.summary} (${confidencePercent}% confidence — too low to act or queue)`
      return {
        summary,
        details: {
          mode: 'autopilot',
          escalated_action: action.summary,
          action_type: action.type,
          confidence: action.confidence,
          reason: 'Below all thresholds',
        },
      }
    }

    default: {
      const summary = `${action.summary} (${gateResult.decision})`
      return {
        summary,
        details: {
          mode: gateResult.autonomyLevel,
          action: action.summary,
          decision: gateResult.decision,
          confidence: action.confidence,
        },
      }
    }
  }
}
