/**
 * Proactive Action Executor
 *
 * Takes a ProactiveDecision and executes the appropriate action based on
 * the autonomy level:
 *   L4 (silent)  → execute directly, activity log only
 *   L3 (notify)  → execute and send notification
 *   L2 (propose) → create suggestion in user's chat/dashboard
 *   L1 (ask)     → create approval request in the approval queue
 *
 * @module proactive/executor
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from '@/lib/agent/approval-queue'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { logger } from '@/lib/core/logger'
import type {
  ProactiveDecision,
  ProactiveAction,
  ExecutionConfig,
  ExecutionResult,
  ProactiveActionStatus,
} from './types'

// ---------------------------------------------------------------------------
// Main Executor
// ---------------------------------------------------------------------------

/**
 * Execute a proactive decision based on its autonomy level.
 *
 * @param supabase - Supabase client (service role for cron context)
 * @param decision - The classified decision from the proactive engine
 * @param config   - Execution configuration (org, agent, notification targets)
 * @returns ExecutionResult with status and details
 */
export async function executeAction(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<ExecutionResult> {
  const actionId = crypto.randomUUID()

  logger.info('[proactive/executor] Executing action', {
    actionId,
    action: decision.action,
    autonomyLevel: decision.autonomyLevel,
    confidence: decision.confidence,
    orgId: config.orgId,
  })

  try {
    switch (decision.autonomyLevel) {
      case 4:
        return await executeSilent(supabase, decision, config, actionId)
      case 3:
        return await executeAndNotify(supabase, decision, config, actionId)
      case 2:
        return await proposeAction(supabase, decision, config, actionId)
      case 1:
        return await requestApproval(supabase, decision, config, actionId)
      default:
        return {
          success: false,
          actionId,
          status: 'rejected',
          error: `Unknown autonomy level: ${decision.autonomyLevel}`,
        }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[proactive/executor] Execution failed', {
      actionId,
      error: errorMsg,
      action: decision.action,
    })
    return {
      success: false,
      actionId,
      status: 'rejected',
      error: errorMsg,
    }
  }
}

// ---------------------------------------------------------------------------
// L4: Execute Silently
// ---------------------------------------------------------------------------

async function executeSilent(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
  actionId: string,
): Promise<ExecutionResult> {
  const payload = await performAction(supabase, decision, config)

  // Log to activity feed (silent — no user notification)
  await logProactiveAction(supabase, config.orgId, actionId, decision, 'executed', payload)

  return {
    success: true,
    actionId,
    status: 'executed',
    details: payload,
  }
}

// ---------------------------------------------------------------------------
// L3: Execute and Notify
// ---------------------------------------------------------------------------

async function executeAndNotify(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
  actionId: string,
): Promise<ExecutionResult> {
  const payload = await performAction(supabase, decision, config)

  // Log the action
  await logProactiveAction(supabase, config.orgId, actionId, decision, 'executed', payload)

  // Send notification about what was done
  await dispatchNotification(supabase, {
    orgId: config.orgId,
    type: 'info',
    title: `BitBit acted: ${actionLabel(decision.action)}`,
    body: decision.reasoning,
    urgency: decision.urgency === 'immediate' ? 'high' : 'normal',
    metadata: {
      proactiveActionId: actionId,
      action: decision.action,
      confidence: decision.confidence,
    },
  }).catch((err) => {
    logger.warn('[proactive/executor] Notification dispatch failed', { error: String(err) })
  })

  return {
    success: true,
    actionId,
    status: 'executed',
    details: payload,
  }
}

// ---------------------------------------------------------------------------
// L2: Propose (Suggest)
// ---------------------------------------------------------------------------

async function proposeAction(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
  actionId: string,
): Promise<ExecutionResult> {
  // Create an approval record with 'ask' routing so it appears as a suggestion
  const approval = await createApproval(supabase, {
    org_id: config.orgId,
    agent_config_id: config.agentConfigId,
    action_type: `proactive:${decision.action}`,
    action_payload: {
      proactiveActionId: actionId,
      action: decision.action,
      reasoning: decision.reasoning,
      urgency: decision.urgency,
      channel: decision.channel,
    },
    action_summary: `[Suggestion] ${decision.reasoning}`,
    confidence_score: decision.confidence,
    routing_decision: 'ask',
    priority: decision.urgency === 'immediate' ? 'urgent' : 'normal',
    context_snapshot: { autonomyLevel: decision.autonomyLevel },
  })

  await logProactiveAction(supabase, config.orgId, actionId, decision, 'pending', {
    approvalId: approval.id,
  })

  return {
    success: true,
    actionId,
    status: 'pending',
    details: { approvalId: approval.id },
  }
}

// ---------------------------------------------------------------------------
// L1: Request Approval
// ---------------------------------------------------------------------------

async function requestApproval(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
  actionId: string,
): Promise<ExecutionResult> {
  // Create an approval record with 'escalate' routing — requires explicit approval
  const approval = await createApproval(supabase, {
    org_id: config.orgId,
    agent_config_id: config.agentConfigId,
    action_type: `proactive:${decision.action}`,
    action_payload: {
      proactiveActionId: actionId,
      action: decision.action,
      reasoning: decision.reasoning,
      urgency: decision.urgency,
      channel: decision.channel,
    },
    action_summary: `[Approval Required] ${decision.reasoning}`,
    confidence_score: decision.confidence,
    routing_decision: 'escalate',
    priority: decision.urgency === 'immediate' ? 'urgent' : 'normal',
    context_snapshot: { autonomyLevel: decision.autonomyLevel },
  })

  await logProactiveAction(supabase, config.orgId, actionId, decision, 'pending', {
    approvalId: approval.id,
  })

  return {
    success: true,
    actionId,
    status: 'pending',
    details: { approvalId: approval.id },
  }
}

// ---------------------------------------------------------------------------
// Action Implementations
// ---------------------------------------------------------------------------

/**
 * Perform the actual action based on the decision type.
 * Returns a payload describing what was done.
 */
async function performAction(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  switch (decision.action) {
    case 'alert_user':
      return await performAlertUser(supabase, decision, config)

    case 'create_task':
      return await performCreateTask(supabase, decision, config)

    case 'update_contact':
      return await performUpdateContact(supabase, decision, config)

    case 'flag_risk':
      return await performFlagRisk(supabase, decision, config)

    case 'suggest_opportunity':
      return await performSuggestOpportunity(supabase, decision, config)

    case 'send_digest':
      return await performSendDigest(supabase, decision, config)

    case 'draft_message':
      // Drafts should always go through approval (L1/L2), but if we reach
      // here at L3/L4, treat it as a notification about a pending draft
      return { type: 'draft_message', note: 'Draft queued for review', reasoning: decision.reasoning }

    case 'none':
      return { type: 'none', note: 'No action taken' }

    default:
      return { type: decision.action, note: 'Unknown action type — logged only' }
  }
}

async function performAlertUser(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  // Insert a whisper / notification for the user
  await dispatchNotification(supabase, {
    orgId: config.orgId,
    type: decision.urgency === 'immediate' ? 'alert_escalation' : 'info',
    title: 'Proactive Alert',
    body: decision.reasoning,
    urgency: decision.urgency === 'immediate' ? 'critical' : 'normal',
    metadata: { action: decision.action },
  })

  return { type: 'alert_user', delivered: true }
}

async function performCreateTask(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      org_id: config.orgId,
      title: `[Auto] ${decision.reasoning.slice(0, 200)}`,
      status: 'todo',
      priority: decision.urgency === 'immediate' ? 'high' : 'medium',
      source: 'proactive_engine',
    })
    .select('id')
    .single()

  if (error) {
    logger.warn('[proactive/executor] Failed to create task', { error: error.message })
    return { type: 'create_task', success: false, error: error.message }
  }

  return { type: 'create_task', taskId: data.id, success: true }
}

async function performUpdateContact(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  _config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  // Update contact metadata — the specific update depends on the signal data
  // This is a silent L4 action, just log what would be updated
  return {
    type: 'update_contact',
    note: 'Contact metadata update logged',
    reasoning: decision.reasoning,
  }
}

async function performFlagRisk(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  // Insert a risk flag into the activity feed
  await supabase.from('activity_feed').insert({
    org_id: config.orgId,
    action_type: 'system',
    action: 'proactive:flag_risk',
    result: decision.reasoning,
  })

  return { type: 'flag_risk', flagged: true }
}

async function performSuggestOpportunity(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  // Log the opportunity suggestion to the activity feed
  await supabase.from('activity_feed').insert({
    org_id: config.orgId,
    action_type: 'system',
    action: 'proactive:suggest_opportunity',
    result: decision.reasoning,
  })

  return { type: 'suggest_opportunity', suggested: true }
}

async function performSendDigest(
  supabase: SupabaseClient,
  decision: ProactiveDecision,
  config: ExecutionConfig,
): Promise<Record<string, unknown>> {
  // Queue a digest notification
  await dispatchNotification(supabase, {
    orgId: config.orgId,
    type: 'info',
    title: 'Proactive Digest',
    body: decision.reasoning,
    urgency: 'low',
    metadata: { action: 'send_digest' },
  })

  return { type: 'send_digest', queued: true }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Log a proactive action to the activity feed for audit trail.
 */
async function logProactiveAction(
  supabase: SupabaseClient,
  orgId: string,
  actionId: string,
  decision: ProactiveDecision,
  status: ProactiveActionStatus,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('activity_feed').insert({
      org_id: orgId,
      action_type: 'system',
      action: `proactive:${decision.action}`,
      result: JSON.stringify({
        actionId,
        status,
        autonomyLevel: decision.autonomyLevel,
        confidence: decision.confidence,
        urgency: decision.urgency,
        reasoning: decision.reasoning,
        ...details,
      }),
    })
  } catch (err) {
    logger.warn('[proactive/executor] Failed to log proactive action', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    alert_user: 'Alert',
    draft_message: 'Draft Message',
    create_task: 'Created Task',
    update_contact: 'Updated Contact',
    flag_risk: 'Flagged Risk',
    suggest_opportunity: 'Opportunity Found',
    send_digest: 'Digest Sent',
    none: 'No Action',
  }
  return labels[action] ?? action
}
