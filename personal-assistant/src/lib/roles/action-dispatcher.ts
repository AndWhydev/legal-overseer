import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleConfig, AutonomyLevel } from '@/lib/bitbit-core'
import type { RoleAction } from './role-registry'
import { routeThroughAutonomyGate, type GateResult } from './autonomy-gate'
import { createApproval } from '@/lib/agent/approval-queue'
import { executeApprovedAction } from '@/lib/agent/action-executor'
import { formatActivityForAutonomy } from './output-formatter'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatchResult {
  actionId: string
  gateResult: GateResult
  approvalId?: string    // if queued
  executionResult?: unknown // if executed
  activityId: string     // always logged
}

// ---------------------------------------------------------------------------
// Action Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a role action: gate it, then execute/queue/log based on decision.
 *
 * Flow:
 * 1. Route through autonomy gate (Observer/Co-pilot/Autopilot)
 * 2. Based on decision:
 *    - execute:       fire-and-forget execution (future: reuse executeApprovedAction pattern)
 *    - queue_approval: call createApproval() with autonomy_mode in context_snapshot
 *    - log_insight:   insert to role_activity with type 'insight'
 *    - escalate:      insert to role_activity with type 'escalation'
 * 3. Always log to role_activity with reasoning chain
 * 4. Return result
 */
export async function dispatchRoleAction(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  action: RoleAction,
): Promise<DispatchResult> {
  const tag = `[action-dispatch:${roleConfig.role_type}:${roleConfig.org_id.slice(0, 8)}]`

  // 1. Route through autonomy gate
  const gateResult = routeThroughAutonomyGate(
    action,
    roleConfig.autonomy_level,
    roleConfig.config as { confidence_thresholds?: { act?: number; ask?: number } } | undefined,
    undefined, // orgSettings — caller can extend if needed
    undefined, // agentType — roles use their own type
    null,      // calibratedThresholds — roles don't use calibration yet
  )

  const actionId = crypto.randomUUID()
  let approvalId: string | undefined
  let executionResult: unknown
  let activityId = ''

  // 2. Dispatch based on gate decision
  switch (gateResult.decision) {
    case 'execute': {
      logger.info(`${tag} Executing action: ${action.summary} (confidence ${action.confidence})`)

      // Create a synthetic approval record to reuse the existing transport executor.
      // This gives us retry logic, idempotency, notifications, and reflection for free.
      try {
        const approval = await createApproval(supabase, {
          org_id: roleConfig.org_id,
          agent_config_id: roleConfig.id,
          action_type: action.type,
          action_payload: action.payload,
          action_summary: action.summary,
          confidence_score: action.confidence,
          routing_decision: 'ask',
          priority: 'normal',
          context_snapshot: {
            autonomy_mode: roleConfig.autonomy_level,
            role_type: roleConfig.role_type,
            role_config_id: roleConfig.id,
            gate_reasoning: gateResult.reasoning,
            reversible: action.reversible,
            auto_executed: true,
          },
          role_config_id: roleConfig.id,
          autonomy_mode: roleConfig.autonomy_level,
        })

        // Immediately approve and execute through the transport map
        await supabase
          .from('approval_queue')
          .update({ status: 'approved' })
          .eq('id', approval.id)

        executionResult = await executeApprovedAction(supabase, { ...approval, status: 'approved' })
        approvalId = approval.id
      } catch (execErr) {
        const execMsg = execErr instanceof Error ? execErr.message : String(execErr)
        logger.error(`${tag} Auto-execution failed: ${execMsg}`)
        executionResult = { success: false, error: execMsg }
      }

      // Log execution to role_activity
      activityId = await logDispatchActivity(supabase, roleConfig, action, gateResult, 'action', approvalId)
      break
    }

    case 'queue_approval': {
      logger.info(`${tag} Queuing for approval: ${action.summary} (mode: ${roleConfig.autonomy_level})`)

      // Create approval record with role context
      try {
        const approval = await createApproval(supabase, {
          org_id: roleConfig.org_id,
          agent_config_id: roleConfig.id, // role_config_id as agent_config_id (cross-reference)
          action_type: action.type,
          action_payload: action.payload,
          action_summary: action.summary,
          confidence_score: action.confidence,
          routing_decision: 'ask',
          priority: action.confidence < 0.5 ? 'urgent' : 'normal',
          context_snapshot: {
            autonomy_mode: roleConfig.autonomy_level,
            role_type: roleConfig.role_type,
            role_config_id: roleConfig.id,
            gate_reasoning: gateResult.reasoning,
            reversible: action.reversible,
          },
          role_config_id: roleConfig.id,
          autonomy_mode: roleConfig.autonomy_level,
        })
        approvalId = approval.id
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`${tag} Failed to create approval: ${message}`)
      }

      // Log queuing to role_activity
      activityId = await logDispatchActivity(supabase, roleConfig, action, gateResult, 'action', approvalId)
      break
    }

    case 'log_insight': {
      logger.info(`${tag} Logging insight: ${action.summary} (observer mode)`)

      // Format output for the autonomy level
      const formatted = formatActivityForAutonomy(action, gateResult)

      // Log as insight to role_activity
      activityId = await logDispatchActivity(
        supabase, roleConfig, action, gateResult, 'insight',
        undefined, formatted.details,
      )

      // Surface insights via dashboard notification so they're visible
      dispatchNotification(supabase, {
        orgId: roleConfig.org_id,
        type: 'info',
        title: `${roleConfig.role_type} insight`,
        body: action.summary,
        urgency: 'low',
        channels: ['dashboard'],
      }).catch(() => {/* fire and forget */})
      break
    }

    case 'escalate': {
      logger.warn(`${tag} Escalating: ${action.summary} (confidence ${action.confidence})`)

      // Log escalation to role_activity
      activityId = await logDispatchActivity(supabase, roleConfig, action, gateResult, 'escalation')

      // Escalations are urgent — notify all channels
      dispatchNotification(supabase, {
        orgId: roleConfig.org_id,
        type: 'alert_escalation',
        title: `${roleConfig.role_type} needs attention`,
        body: action.summary,
        urgency: 'high',
        channels: ['dashboard', 'email'],
      }).catch(() => {/* fire and forget */})
      break
    }
  }

  return {
    actionId,
    gateResult,
    approvalId,
    executionResult,
    activityId,
  }
}

// ---------------------------------------------------------------------------
// Batch dispatch — convenience for multiple actions from a role evaluation
// ---------------------------------------------------------------------------

/**
 * Dispatch multiple role actions through the autonomy gate.
 * Processes sequentially to maintain ordering guarantees.
 */
export async function dispatchRoleActions(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  actions: RoleAction[],
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []

  for (const action of actions) {
    const result = await dispatchRoleAction(supabase, roleConfig, action)
    results.push(result)
  }

  return results
}

// ---------------------------------------------------------------------------
// Internal: Activity logging helper
// ---------------------------------------------------------------------------

async function logDispatchActivity(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  action: RoleAction,
  gateResult: GateResult,
  activityType: 'insight' | 'action' | 'escalation',
  approvalId?: string,
  extraDetails?: Record<string, unknown>,
): Promise<string> {
  const formatted = formatActivityForAutonomy(action, gateResult)

  const details: Record<string, unknown> = {
    action_type: action.type,
    action_payload: action.payload,
    gate_decision: gateResult.decision,
    gate_reasoning: gateResult.reasoning,
    confidence: action.confidence,
    reversible: action.reversible,
    formatted_summary: formatted.summary,
    ...formatted.details,
    ...extraDetails,
  }

  if (approvalId) {
    details.approval_id = approvalId
  }

  if (gateResult.confidenceRouting) {
    details.confidence_routing = {
      decision: gateResult.confidenceRouting.decision,
      thresholds: gateResult.confidenceRouting.thresholds,
      thresholdSource: gateResult.confidenceRouting.thresholdSource,
    }
  }

  const { data, error } = await supabase.from('role_activity').insert({
    role_config_id: roleConfig.id,
    org_id: roleConfig.org_id,
    activity_type: activityType,
    summary: formatted.summary,
    details,
    autonomy_mode: roleConfig.autonomy_level as AutonomyLevel,
    confidence: action.confidence,
    reasoning: gateResult.reasoning,
    reversible: action.reversible,
  }).select('id').single()

  if (error) {
    logger.warn(`[action-dispatch] Failed to log activity: ${error.message}`)
    return ''
  }

  return data?.id ?? ''
}
