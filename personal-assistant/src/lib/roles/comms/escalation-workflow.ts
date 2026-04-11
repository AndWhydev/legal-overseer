import type { WorkflowStepDef, WorkflowStepContext } from '../workflow-executor'
import type { WorkflowDefinition } from '../role-registry'
import type { UnansweredThread } from './follow-up-tracker'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EscalationStepResult {
  action: 'drafted_response' | 'sent_reminder' | 'escalated_to_user' | 'resolved'
  contactId: string
  hoursOverdue: number
  draftPreview?: string
}

// ---------------------------------------------------------------------------
// Escalation Workflow Constants
// ---------------------------------------------------------------------------

/** Hour thresholds for each escalation step */
export const ESCALATION_SCHEDULE = {
  auto_draft: 2,     // Step 1: 2h overdue -- auto-draft a response
  notify_user: 8,    // Step 2: 8h overdue -- notify user of pending reply
  escalate: 24,      // Step 3: 24h overdue -- escalation alert
} as const

/** Delay in seconds between steps */
const STEP_DELAYS: Record<string, number> = {
  auto_draft: 2 * 3600,      // 2 hours
  notify_user: 6 * 3600,     // 6 hours after draft (8h total)
  escalation_alert: 16 * 3600, // 16 hours after notify (24h total)
}

// ---------------------------------------------------------------------------
// Create Escalation Workflow
// ---------------------------------------------------------------------------

/**
 * Creates a WorkflowDefinition for overdue response escalation.
 * The runtime will call getEscalationStepDefs/getEscalationStepDef
 * to get the execution functions.
 */
export function createEscalationWorkflow(thread: UnansweredThread): WorkflowDefinition {
  return {
    workflowType: 'response_escalation',
    steps: [
      { stepId: 'auto_draft', name: 'Auto-Draft Response' },
      { stepId: 'notify_user', name: 'Notify User' },
      { stepId: 'escalation_alert', name: 'Escalation Alert' },
    ],
    context: {
      contactId: thread.contactId,
      contactName: thread.contactName,
      topic: thread.topic,
      channel: thread.channel,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt,
      startedHoursOverdue: thread.hoursWaiting,
    },
  }
}

// ---------------------------------------------------------------------------
// Step Definitions (for resume + start)
// ---------------------------------------------------------------------------

/**
 * Returns full step definitions for the response_escalation workflow.
 * Called by role runtime via getWorkflowStepDefs('response_escalation').
 */
export function getEscalationStepDefs(): WorkflowStepDef[] {
  return [
    {
      id: 'auto_draft',
      name: 'Auto-Draft Response',
      delaySeconds: STEP_DELAYS.auto_draft,
      condition: threadStillUnanswered,
      execute: createAutoDraftStep(),
    },
    {
      id: 'notify_user',
      name: 'Notify User',
      delaySeconds: STEP_DELAYS.notify_user,
      condition: threadStillUnanswered,
      execute: createNotifyUserStep(),
    },
    {
      id: 'escalation_alert',
      name: 'Escalation Alert',
      delaySeconds: STEP_DELAYS.escalation_alert,
      condition: threadStillUnanswered,
      execute: createEscalationAlertStep(),
    },
  ]
}

/**
 * Returns a single step definition override.
 * Called by role runtime via getWorkflowStepDef('response_escalation', stepId).
 */
export function getEscalationStepDef(stepId: string): Partial<WorkflowStepDef> | undefined {
  const all = getEscalationStepDefs()
  return all.find((s) => s.id === stepId)
}

// ---------------------------------------------------------------------------
// Condition: Check if thread is still unanswered
// ---------------------------------------------------------------------------

function threadStillUnanswered(ctx: WorkflowStepContext): boolean {
  // Check if a previous step already resolved the thread
  const prevResults = ctx.stepResults
  for (const [, result] of Object.entries(prevResults)) {
    const r = result as EscalationStepResult | undefined
    if (r?.action === 'resolved') return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Step Factories
// ---------------------------------------------------------------------------

function createAutoDraftStep(): (ctx: WorkflowStepContext) => Promise<import('../workflow-executor').WorkflowStepResult> {
  return async (ctx) => {
    const contactId = ctx.workflow.context.contactId as string
    const contactName = ctx.workflow.context.contactName as string
    const topic = ctx.workflow.context.topic as string
    const channel = ctx.workflow.context.channel as string
    const lastMessagePreview = ctx.workflow.context.lastMessagePreview as string
    const lastMessageAt = ctx.workflow.context.lastMessageAt as string
    const tag = `[escalation:auto_draft:${contactName}]`

    // Check if the thread has been answered since workflow started
    const { data: outbound } = await ctx.supabase
      .from('entity_timeline')
      .select('occurred_at')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', 'contact')
      .eq('entity_id', contactId)
      .eq('event_type', 'message_sent')
      .gte('occurred_at', lastMessageAt)
      .limit(1)

    if (outbound && outbound.length > 0) {
      logger.info(`${tag} Thread already answered, resolving workflow`)
      return {
        success: true,
        result: { action: 'resolved', contactId, hoursOverdue: 0 } satisfies EscalationStepResult,
      }
    }

    const hoursOverdue = Math.round(
      (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60),
    )

    // Queue a draft response via the approval queue
    const autonomyLevel = ctx.roleConfig.autonomy_level

    if (autonomyLevel === 'observer') {
      logger.info(`${tag} Observer mode: logged auto-draft insight for ${contactName}`)
    } else {
      // Queue draft for approval (copilot) or auto-approve (autopilot)
      await ctx.supabase.from('approval_queue').insert({
        org_id: ctx.orgId,
        agent_config_id: ctx.roleConfig.id,
        action_type: 'send_client_reply',
        action_payload: {
          contactId,
          channel,
          topic,
          auto_drafted: true,
          incoming_preview: lastMessagePreview,
        },
        action_summary: `Auto-draft response to ${contactName} about "${topic}" (${hoursOverdue}h overdue)`,
        confidence_score: 0.7,
        routing_decision: autonomyLevel === 'autopilot' ? 'auto' : 'ask',
        priority: hoursOverdue >= 8 ? 'urgent' : 'normal',
        status: autonomyLevel === 'autopilot' ? 'approved' : 'pending',
        context_snapshot: {
          source: 'response-escalation',
          workflow_id: ctx.workflow.id,
          hours_overdue: hoursOverdue,
        },
      })
      logger.info(`${tag} Queued auto-draft for ${contactName} (${hoursOverdue}h overdue)`)
    }

    return {
      success: true,
      result: {
        action: 'drafted_response',
        contactId,
        hoursOverdue,
        draftPreview: `Auto-draft for ${topic}`,
      } satisfies EscalationStepResult,
    }
  }
}

function createNotifyUserStep(): (ctx: WorkflowStepContext) => Promise<import('../workflow-executor').WorkflowStepResult> {
  return async (ctx) => {
    const contactId = ctx.workflow.context.contactId as string
    const contactName = ctx.workflow.context.contactName as string
    const topic = ctx.workflow.context.topic as string
    const lastMessageAt = ctx.workflow.context.lastMessageAt as string
    const tag = `[escalation:notify:${contactName}]`

    // Check if answered
    const { data: outbound } = await ctx.supabase
      .from('entity_timeline')
      .select('occurred_at')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', 'contact')
      .eq('entity_id', contactId)
      .eq('event_type', 'message_sent')
      .gte('occurred_at', lastMessageAt)
      .limit(1)

    if (outbound && outbound.length > 0) {
      logger.info(`${tag} Thread already answered, resolving workflow`)
      return {
        success: true,
        result: { action: 'resolved', contactId, hoursOverdue: 0 } satisfies EscalationStepResult,
      }
    }

    const hoursOverdue = Math.round(
      (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60),
    )

    // Log notification as role activity (visible in dashboard)
    await ctx.supabase.from('role_activity').insert({
      role_config_id: ctx.roleConfig.id,
      org_id: ctx.orgId,
      activity_type: 'notification',
      summary: `${contactName} is waiting for a response about "${topic}" (${hoursOverdue}h). A draft response was prepared but not yet sent.`,
      details: {
        contact_id: contactId,
        contact_name: contactName,
        topic,
        hours_overdue: hoursOverdue,
        workflow_id: ctx.workflow.id,
      },
      autonomy_mode: ctx.roleConfig.autonomy_level,
      reversible: false,
    })

    logger.info(`${tag} Notified user about pending response to ${contactName} (${hoursOverdue}h)`)

    return {
      success: true,
      result: {
        action: 'sent_reminder',
        contactId,
        hoursOverdue,
      } satisfies EscalationStepResult,
    }
  }
}

function createEscalationAlertStep(): (ctx: WorkflowStepContext) => Promise<import('../workflow-executor').WorkflowStepResult> {
  return async (ctx) => {
    const contactId = ctx.workflow.context.contactId as string
    const contactName = ctx.workflow.context.contactName as string
    const topic = ctx.workflow.context.topic as string
    const lastMessageAt = ctx.workflow.context.lastMessageAt as string
    const tag = `[escalation:alert:${contactName}]`

    // Check if answered
    const { data: outbound } = await ctx.supabase
      .from('entity_timeline')
      .select('occurred_at')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', 'contact')
      .eq('entity_id', contactId)
      .eq('event_type', 'message_sent')
      .gte('occurred_at', lastMessageAt)
      .limit(1)

    if (outbound && outbound.length > 0) {
      logger.info(`${tag} Thread already answered, resolving workflow`)
      return {
        success: true,
        result: { action: 'resolved', contactId, hoursOverdue: 0 } satisfies EscalationStepResult,
      }
    }

    const hoursOverdue = Math.round(
      (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60),
    )

    // High-priority escalation alert (visible in dashboard + notification center)
    await ctx.supabase.from('role_activity').insert({
      role_config_id: ctx.roleConfig.id,
      org_id: ctx.orgId,
      activity_type: 'escalation',
      summary: `OVERDUE: ${contactName} has been waiting ${hoursOverdue}h for a response about "${topic}". All automated reminders exhausted. Manual response required.`,
      details: {
        contact_id: contactId,
        contact_name: contactName,
        topic,
        hours_overdue: hoursOverdue,
        workflow_id: ctx.workflow.id,
        escalation_level: 'critical',
      },
      autonomy_mode: ctx.roleConfig.autonomy_level,
      reversible: false,
    })

    logger.info(`${tag} Escalated overdue response to ${contactName} (${hoursOverdue}h)`)

    return {
      success: true,
      result: {
        action: 'escalated_to_user',
        contactId,
        hoursOverdue,
      } satisfies EscalationStepResult,
    }
  }
}
