import type { RoleContext } from '../role-runtime'
import type { RoleAction, RoleInsight } from '../role-registry'
import { runTriage, type TriageResult } from '@/lib/agent/channel-triage'
import { runClientCommsTick, type ClientCommsTickResult } from '@/lib/agent/client-comms'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrappedTriageTickResult {
  actions: RoleAction[]
  insights: RoleInsight[]
  raw: TriageResult | null
}

export interface WrappedCommsTickResult {
  actions: RoleAction[]
  insights: RoleInsight[]
  raw: ClientCommsTickResult | null
}

// ---------------------------------------------------------------------------
// Wrapped Triage Tick
// ---------------------------------------------------------------------------

/**
 * Wraps the existing runTriage() function and translates TriageResult
 * into role actions and insights.
 *
 * This function does NOT modify channel-triage.ts. It only calls it
 * and maps its outputs to the role engine format.
 */
export async function runWrappedTriageTick(
  ctx: RoleContext,
): Promise<WrappedTriageTickResult> {
  const tag = `[triage-wrapper:${ctx.orgId.slice(0, 8)}]`
  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  let triageResult: TriageResult | null = null

  try {
    triageResult = await runTriage(ctx.supabase, ctx.orgId)

    logger.info(
      `${tag} Triage tick: ${triageResult.processed} processed, ` +
      `${triageResult.actionable} actionable, ${triageResult.informational} informational, ` +
      `${triageResult.spam} spam, ${triageResult.tasksCreated} tasks created`,
    )

    // Convert routed messages to role actions
    for (const route of triageResult.routed) {
      actions.push({
        type: 'route_message',
        summary: `Routed message ${route.messageId.slice(0, 8)} to ${route.agent} (priority: ${route.priority})`,
        payload: {
          messageId: route.messageId,
          targetAgent: route.agent,
          priority: route.priority,
        },
        confidence: 0.9,
        reversible: true,
      })
    }

    // Surface spam filtered as insight
    if (triageResult.spam > 0) {
      insights.push({
        summary: `Filtered ${triageResult.spam} spam message${triageResult.spam > 1 ? 's' : ''}`,
        details: { count: triageResult.spam },
        priority: 'low',
      })
    }

    // Surface informational count as insight
    if (triageResult.informational > 0) {
      insights.push({
        summary: `${triageResult.informational} informational message${triageResult.informational > 1 ? 's' : ''} processed (FYI only)`,
        details: { count: triageResult.informational },
        priority: 'low',
      })
    }

    // Surface actionable as insight
    if (triageResult.actionable > 0) {
      insights.push({
        summary: `${triageResult.actionable} actionable message${triageResult.actionable > 1 ? 's' : ''} detected and routed`,
        details: {
          count: triageResult.actionable,
          tasksCreated: triageResult.tasksCreated,
          entitiesLinked: triageResult.entitiesLinked,
        },
        priority: 'medium',
      })
    }

    // Deduplication insight
    if (triageResult.deduplicated > 0) {
      insights.push({
        summary: `Deduplicated ${triageResult.deduplicated} cross-channel duplicate${triageResult.deduplicated > 1 ? 's' : ''}`,
        details: { count: triageResult.deduplicated },
        priority: 'low',
      })
    }

    // Tasks created as action
    if (triageResult.tasksCreated > 0) {
      actions.push({
        type: 'task_created',
        summary: `Created ${triageResult.tasksCreated} task${triageResult.tasksCreated > 1 ? 's' : ''} from actionable messages`,
        payload: { count: triageResult.tasksCreated },
        confidence: 1.0,
        reversible: true,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Triage tick failed: ${message}`)
    insights.push({
      summary: `Triage tick failed: ${message}`,
      details: { error: message },
      priority: 'high',
    })
  }

  return {
    actions,
    insights,
    raw: triageResult,
  }
}

// ---------------------------------------------------------------------------
// Wrapped Client Comms Tick
// ---------------------------------------------------------------------------

/**
 * Wraps the existing runClientCommsTick() function and translates
 * ClientCommsTickResult into role actions and insights.
 *
 * This function does NOT modify client-comms.ts. It only calls it
 * and maps its outputs to the role engine format.
 */
export async function runWrappedCommsTick(
  ctx: RoleContext,
): Promise<WrappedCommsTickResult> {
  const tag = `[comms-wrapper:${ctx.orgId.slice(0, 8)}]`
  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  let commsResult: ClientCommsTickResult | null = null

  try {
    commsResult = await runClientCommsTick(
      ctx.supabase,
      ctx.orgId,
      ctx.config.id, // role_config_id as agent_config_id
    )

    logger.info(
      `${tag} Comms tick: ${commsResult.processed} processed, ` +
      `${commsResult.drafted} drafted, ${commsResult.sent} sent, ` +
      `${commsResult.queued} queued, ${commsResult.failed} failed`,
    )

    // Convert sent replies to role actions
    if (commsResult.sent > 0) {
      actions.push({
        type: 'response_sent',
        summary: `Sent ${commsResult.sent} approved response${commsResult.sent > 1 ? 's' : ''}`,
        payload: { count: commsResult.sent },
        confidence: 1.0,
        reversible: false, // Can't unsend
      })
    }

    // Convert drafted replies to role actions
    if (commsResult.drafted > 0) {
      actions.push({
        type: 'draft_response',
        summary: `Drafted ${commsResult.drafted} response${commsResult.drafted > 1 ? 's' : ''} (${commsResult.queued} queued for approval)`,
        payload: {
          count: commsResult.drafted,
          queued: commsResult.queued,
        },
        confidence: 0.8,
        reversible: true,
      })
    }

    // Surface failures as insight
    if (commsResult.failed > 0) {
      insights.push({
        summary: `${commsResult.failed} comms operation${commsResult.failed > 1 ? 's' : ''} failed during tick`,
        details: { count: commsResult.failed },
        priority: 'high',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Comms tick failed: ${message}`)
    insights.push({
      summary: `Comms tick failed: ${message}`,
      details: { error: message },
      priority: 'high',
    })
  }

  return {
    actions,
    insights,
    raw: commsResult,
  }
}
