import type { RoleImplementation } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import type { RoleEvaluation, RoleAction, RoleInsight, WorkflowDefinition } from '../role-registry'
import type { WorkflowStepDef } from '../workflow-executor'
import { runWrappedTriageTick, runWrappedCommsTick } from './triage-wrapper'
import { detectUnansweredThreads } from './follow-up-tracker'
import { monitorCommunicationFrequency, detectEngagementDrops } from './relationship-monitor'
import { adaptDraft } from './tone-adapter'
import {
  createEscalationWorkflow,
  getEscalationStepDefs,
  getEscalationStepDef,
} from './escalation-workflow'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Comms-Specific State Schema (Plan 22-03 Task 1)
// ---------------------------------------------------------------------------

/**
 * Shape of the JSONB stored in role_states.state for the comms role.
 * All fields are optional for backward compat with existing state rows.
 */
export interface CommsState {
  /** Last time triage ran */
  last_triage_at: string | null
  /** Last time follow-up scan ran */
  last_followup_scan_at: string | null
  /** Per-contact learned tone profiles */
  client_tone_profiles: Record<string, ToneProfile>
  /** Per-contact engagement baselines: contactId -> stats */
  engagement_baselines: Record<string, { avgMessagesPerWeek: number; lastCalculated: string }>
  /** IDs of active follow-up escalation workflows */
  active_followup_workflows: string[]

  // Cumulative stats
  last_comms_tick_at?: string
  total_messages_triaged?: number
  total_responses_drafted?: number
  total_responses_sent?: number
}

export interface ToneProfile {
  formality: 'formal' | 'neutral' | 'casual'
  verbosity: 'concise' | 'moderate' | 'verbose'
  preferredGreeting: string | null
  preferredSignOff: string | null
  samplePhrases: string[]
  lastUpdated: string
}

/** Type-safe accessor for comms state fields */
function getCommsState(state: Record<string, unknown>): CommsState {
  return {
    last_triage_at: (state.last_triage_at as string) ?? null,
    last_followup_scan_at: (state.last_followup_scan_at as string) ?? null,
    client_tone_profiles: (state.client_tone_profiles as Record<string, ToneProfile>) ?? {},
    engagement_baselines: (state.engagement_baselines as Record<string, { avgMessagesPerWeek: number; lastCalculated: string }>) ?? {},
    active_followup_workflows: (state.active_followup_workflows as string[]) ?? [],
    last_comms_tick_at: state.last_comms_tick_at as string | undefined,
    total_messages_triaged: state.total_messages_triaged as number | undefined,
    total_responses_drafted: state.total_responses_drafted as number | undefined,
    total_responses_sent: state.total_responses_sent as number | undefined,
  }
}

// ---------------------------------------------------------------------------
// Comms Role Implementation
// ---------------------------------------------------------------------------

/**
 * Comms role: owns all communication operations.
 *
 * Wraps the existing channel triage (channel-triage.ts) and client comms
 * (client-comms.ts) as sub-components. Same "wrap, don't rewrite" pattern
 * as the Finance role. Proactive behaviors include:
 * - Triaging inbound messages across all channels
 * - Drafting contextual replies routed through autonomy gate
 * - Tracking unanswered threads and escalating overdue responses
 * - Monitoring per-client communication frequency and engagement
 * - Adapting response tone to match each client's style
 */
const commsRole: RoleImplementation = {
  type: 'comms',
  name: 'Communications',
  description: 'Owns all communication operations: channel triage, response drafting, follow-ups, relationship monitoring',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const tag = `[comms-role:${ctx.orgId.slice(0, 8)}]`
    logger.info(`${tag} Evaluating...`)

    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const workflowsToStart: WorkflowDefinition[] = []
    const commsState = getCommsState(ctx.state.state ?? {})
    const now = new Date().toISOString()

    // -----------------------------------------------------------------------
    // 1. Run wrapped triage tick (existing behavior -- wrap, don't rewrite)
    // -----------------------------------------------------------------------
    const triageResult = await runWrappedTriageTick(ctx)
    actions.push(...triageResult.actions)
    insights.push(...triageResult.insights)

    // -----------------------------------------------------------------------
    // 2. Run wrapped client comms tick (draft + send approved replies)
    // -----------------------------------------------------------------------
    const commsResult = await runWrappedCommsTick(ctx)
    actions.push(...commsResult.actions)
    insights.push(...commsResult.insights)

    // -----------------------------------------------------------------------
    // 3. Follow-up tracking — detect unanswered threads (Plan 22-02)
    // -----------------------------------------------------------------------
    try {
      const slaHours = (ctx.config.config?.sla_hours as Record<string, number>) ?? {
        critical: 2,
        high: 8,
        medium: 24,
        low: 72,
      }
      const unanswered = await detectUnansweredThreads(ctx.supabase, ctx.orgId, slaHours)

      for (const thread of unanswered) {
        if (ctx.autonomyLevel === 'observer') {
          insights.push({
            summary: `Unanswered thread from ${thread.contactName}: "${thread.topic}" (${thread.hoursWaiting}h, ${thread.urgency} urgency)`,
            details: {
              contactId: thread.contactId,
              contactName: thread.contactName,
              topic: thread.topic,
              hoursWaiting: thread.hoursWaiting,
              urgency: thread.urgency,
            },
            priority: thread.urgency === 'critical' ? 'high' : thread.urgency === 'high' ? 'high' : 'medium',
          })
        } else {
          // Co-pilot / Autopilot: surface as draft-response action
          actions.push({
            type: 'draft_response',
            summary: `Draft response to ${thread.contactName}: "${thread.topic}" (${thread.hoursWaiting}h waiting, ${thread.urgency} urgency)`,
            payload: {
              contactId: thread.contactId,
              contactName: thread.contactName,
              topic: thread.topic,
              channel: thread.channel,
              lastMessagePreview: thread.lastMessagePreview,
              hoursWaiting: thread.hoursWaiting,
              urgency: thread.urgency,
            },
            confidence: thread.urgency === 'critical' ? 0.95 : 0.8,
            reversible: true,
          })

          // Start escalation workflow if critically overdue
          if (thread.hoursWaiting > (slaHours.critical ?? 2) * 3) {
            const existingWf = commsState.active_followup_workflows.includes(thread.contactId)
            if (!existingWf) {
              const wfDef = createEscalationWorkflow(thread)
              workflowsToStart.push(wfDef)
              commsState.active_followup_workflows.push(thread.contactId)

              insights.push({
                summary: `Started escalation workflow for overdue response to ${thread.contactName} (${thread.hoursWaiting}h waiting)`,
                details: {
                  contactId: thread.contactId,
                  hoursWaiting: thread.hoursWaiting,
                },
                priority: 'high',
              })
            }
          }
        }
      }

      commsState.last_followup_scan_at = now

      if (unanswered.length > 0) {
        logger.info(`${tag} Follow-up: found ${unanswered.length} unanswered threads`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Follow-up tracking failed: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 4. Relationship monitoring — detect engagement drops (Plan 22-02)
    // -----------------------------------------------------------------------
    try {
      const frequencyData = await monitorCommunicationFrequency(ctx.supabase, ctx.orgId)
      const drops = detectEngagementDrops(frequencyData, commsState.engagement_baselines)

      for (const drop of drops) {
        insights.push({
          summary: `Engagement drop for ${drop.contactName}: ${drop.previousRate.toFixed(1)} -> ${drop.currentRate.toFixed(1)} msgs/week (${drop.dropPercent}% decrease)`,
          details: {
            contactId: drop.contactId,
            contactName: drop.contactName,
            previousRate: drop.previousRate,
            currentRate: drop.currentRate,
            dropPercent: drop.dropPercent,
            status: drop.status,
          },
          priority: drop.status === 'dormant' ? 'high' : 'medium',
        })
      }

      // Update engagement baselines in state
      for (const entry of frequencyData) {
        commsState.engagement_baselines[entry.contactId] = {
          avgMessagesPerWeek: entry.messagesPerWeek,
          lastCalculated: now,
        }
      }

      if (drops.length > 0) {
        logger.info(`${tag} Relationship: ${drops.length} engagement drops detected`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Relationship monitoring failed: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 5. Build state updates
    // -----------------------------------------------------------------------
    const stateUpdates: Record<string, unknown> = {
      last_comms_tick_at: now,
      last_triage_at: commsState.last_triage_at ?? now,
      last_followup_scan_at: commsState.last_followup_scan_at,
      client_tone_profiles: commsState.client_tone_profiles,
      engagement_baselines: commsState.engagement_baselines,
      active_followup_workflows: commsState.active_followup_workflows,
    }

    // Track cumulative stats
    const prevTriaged = commsState.total_messages_triaged ?? 0
    const prevDrafted = commsState.total_responses_drafted ?? 0
    const prevSent = commsState.total_responses_sent ?? 0

    const newTriaged = triageResult.raw?.processed ?? 0
    const newDrafted = commsResult.raw?.drafted ?? 0
    const newSent = commsResult.raw?.sent ?? 0

    if (newTriaged > 0) stateUpdates.total_messages_triaged = prevTriaged + newTriaged
    if (newDrafted > 0) stateUpdates.total_responses_drafted = prevDrafted + newDrafted
    if (newSent > 0) stateUpdates.total_responses_sent = prevSent + newSent

    logger.info(
      `${tag} Complete: ${actions.length} actions, ${insights.length} insights, ` +
      `${workflowsToStart.length} workflows to start`,
    )

    return {
      actions,
      insights,
      stateUpdates,
      workflowsToStart,
    }
  },

  // -------------------------------------------------------------------------
  // Workflow step definitions (for runtime to resume/start workflows)
  // -------------------------------------------------------------------------

  getWorkflowStepDefs(workflowType: string): WorkflowStepDef[] {
    if (workflowType === 'response_escalation') {
      return getEscalationStepDefs()
    }
    return []
  },

  getWorkflowStepDef(workflowType: string, stepId: string): Partial<WorkflowStepDef> | undefined {
    if (workflowType === 'response_escalation') {
      return getEscalationStepDef(stepId)
    }
    return undefined
  },

  // -------------------------------------------------------------------------
  // Haiku pre-screen: has anything changed since last tick?
  // -------------------------------------------------------------------------

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    const tag = `[comms-role:${ctx.orgId.slice(0, 8)}]`

    try {
      // Check 1: Any unprocessed messages?
      const { count: unprocessedCount, error: unprocessedError } = await ctx.supabase
        .from('channel_messages')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('processed', false)

      if (!unprocessedError && (unprocessedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${unprocessedCount} unprocessed messages`)
        return true
      }

      // Check 2: Any approved reply actions waiting?
      const { count: approvedCount, error: approvedError } = await ctx.supabase
        .from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('action_type', 'send_client_reply')
        .eq('status', 'approved')

      if (!approvedError && (approvedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${approvedCount} approved reply actions pending`)
        return true
      }

      // Check 3: Any active escalation workflows ready for next step?
      const { count: readyWfCount, error: wfError } = await ctx.supabase
        .from('role_workflows')
        .select('id', { count: 'exact', head: true })
        .eq('role_config_id', ctx.config.id)
        .eq('status', 'active')
        .lte('next_step_at', new Date().toISOString())

      if (!wfError && (readyWfCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${readyWfCount} escalation workflows ready for next step`)
        return true
      }

      // Check 4: New messages since last tick (for follow-up tracking)
      const lastTickAt = ctx.state.last_tick_at
      if (lastTickAt) {
        const { count: newCount, error: newError } = await ctx.supabase
          .from('channel_messages')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId)
          .gt('received_at', lastTickAt)

        if (!newError && (newCount ?? 0) > 0) {
          logger.info(`${tag} Pre-screen: ${newCount} new messages since last tick`)
          return true
        }
      }

      return false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Pre-screen error (proceeding with tick): ${message}`)
      return true
    }
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 300, // 5-min tick (comms needs to be responsive)
      daily_budget_cents: 500,     // $5/day
      autonomy_level: 'copilot',
      config: {
        sla_hours: {
          critical: 2,
          high: 8,
          medium: 24,
          low: 72,
        },
        auto_draft_enabled: true,
        tone_adaptation_enabled: true,
      },
    }
  },
}

// Auto-register on import
import { registerRole } from '../role-registry'
registerRole(commsRole)

export { commsRole, getCommsState }
