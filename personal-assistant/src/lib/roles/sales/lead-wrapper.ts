import type { RoleContext } from '../role-runtime'
import type { RoleAction, RoleInsight } from '../role-registry'
import { runLeadSwarmTick, type LeadSwarmTickResult } from '@/lib/agent/lead-swarm'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrappedLeadTickResult {
  actions: RoleAction[]
  insights: RoleInsight[]
  raw: LeadSwarmTickResult | null
}

// ---------------------------------------------------------------------------
// Wrapped Lead Swarm Tick
// ---------------------------------------------------------------------------

/**
 * Wraps the existing runLeadSwarmTick() function and translates
 * LeadSwarmTickResult into role actions and insights.
 *
 * This function does NOT modify lead-swarm.ts. It only calls it
 * and maps its outputs to the role engine format.
 */
export async function runWrappedLeadTick(
  ctx: RoleContext,
): Promise<WrappedLeadTickResult> {
  const tag = `[lead-wrapper:${ctx.orgId.slice(0, 8)}]`
  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  let leadResult: LeadSwarmTickResult | null = null

  try {
    leadResult = await runLeadSwarmTick(
      ctx.supabase,
      ctx.orgId,
      ctx.config.id, // role_config_id as agent_config_id
    )

    logger.info(
      `${tag} Lead tick: ${leadResult.processed} processed, ` +
      `${leadResult.created} created, ${leadResult.qualified} qualified, ` +
      `${leadResult.hot} hot, ${leadResult.autoApproved} auto-approved, ` +
      `${leadResult.failed} failed`,
    )

    // Convert newly created leads to role actions
    if (leadResult.created > 0) {
      actions.push({
        type: 'lead_created',
        summary: `Classified ${leadResult.created} new lead${leadResult.created > 1 ? 's' : ''} (${leadResult.qualified} qualified, ${leadResult.hot} hot)`,
        payload: {
          created: leadResult.created,
          qualified: leadResult.qualified,
          hot: leadResult.hot,
        },
        confidence: 0.9,
        reversible: true,
      })
    }

    // Surface auto-approved acks as actions
    if (leadResult.autoApproved > 0) {
      actions.push({
        type: 'lead_ack_sent',
        summary: `Auto-approved ${leadResult.autoApproved} lead acknowledgment${leadResult.autoApproved > 1 ? 's' : ''}`,
        payload: { count: leadResult.autoApproved },
        confidence: 1.0,
        reversible: false,
      })
    }

    // Surface hot leads as high-priority insight
    if (leadResult.hot > 0) {
      insights.push({
        summary: `${leadResult.hot} hot lead${leadResult.hot > 1 ? 's' : ''} detected -- high-value prospects requiring attention`,
        details: { count: leadResult.hot },
        priority: 'high',
      })
    }

    // Surface failures as insight
    if (leadResult.failed > 0) {
      insights.push({
        summary: `${leadResult.failed} lead processing operation${leadResult.failed > 1 ? 's' : ''} failed during tick`,
        details: { count: leadResult.failed },
        priority: 'high',
      })
    }

    // Surface processing stats as insight when work was done
    if (leadResult.processed > 0 && leadResult.created === 0) {
      insights.push({
        summary: `Processed ${leadResult.processed} inbound message${leadResult.processed > 1 ? 's' : ''} (none classified as leads)`,
        details: { processed: leadResult.processed },
        priority: 'low',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Lead tick failed: ${message}`)
    insights.push({
      summary: `Lead tick failed: ${message}`,
      details: { error: message },
      priority: 'high',
    })
  }

  return {
    actions,
    insights,
    raw: leadResult,
  }
}
