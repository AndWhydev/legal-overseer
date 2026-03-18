import type { RoleImplementation } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import type { RoleEvaluation, RoleAction, RoleInsight, WorkflowDefinition } from '../role-registry'
import type { WorkflowStepDef } from '../workflow-executor'
import { registerRole } from '../role-registry'
import { runWrappedLeadTick } from './lead-wrapper'
import { runWrappedProposalTick } from './proposal-generator'
import {
  checkStaleLeads,
  checkStaleProposals,
  getNurtureStepDefs,
  getNurtureStepDef,
  createNurtureWorkflow,
} from './lead-nurture'
import {
  checkNewConversions,
  getOnboardingStepDefs,
  getOnboardingStepDef,
  createOnboardingWorkflow,
} from './client-onboarding'
import { analyzeWinLossPatterns } from './win-loss-learner'
import { computePipelineSnapshot } from './pipeline-tracker'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Sales-Specific State Schema
// ---------------------------------------------------------------------------

/**
 * Shape of the JSONB stored in role_states.state for the sales role.
 * All fields are optional for backward compat with existing state rows.
 */
export interface SalesState {
  /** Last time lead swarm ran */
  last_lead_tick_at: string | null
  /** Last time proposal bot ran */
  last_proposal_tick_at: string | null
  /** Last time nurture scan ran */
  last_nurture_scan_at: string | null
  /** Last time onboarding check ran */
  last_onboarding_check_at: string | null
  /** Last time win/loss analysis ran */
  last_winloss_analysis_at: string | null
  /** Last time pipeline snapshot was computed */
  last_pipeline_snapshot_at: string | null
  /** IDs of active nurture workflows */
  active_nurture_workflows: string[]
  /** IDs of active onboarding workflows */
  active_onboarding_workflows: string[]
  /** Learned pricing patterns: projectType -> { avgPrice, count } */
  pricing_patterns: Record<string, { avgPrice: number; count: number }>

  // Cumulative stats
  total_leads_processed?: number
  total_proposals_generated?: number
  total_conversions?: number
}

/** Type-safe accessor for sales state fields */
function getSalesState(state: Record<string, unknown>): SalesState {
  return {
    last_lead_tick_at: (state.last_lead_tick_at as string) ?? null,
    last_proposal_tick_at: (state.last_proposal_tick_at as string) ?? null,
    last_nurture_scan_at: (state.last_nurture_scan_at as string) ?? null,
    last_onboarding_check_at: (state.last_onboarding_check_at as string) ?? null,
    last_winloss_analysis_at: (state.last_winloss_analysis_at as string) ?? null,
    last_pipeline_snapshot_at: (state.last_pipeline_snapshot_at as string) ?? null,
    active_nurture_workflows: (state.active_nurture_workflows as string[]) ?? [],
    active_onboarding_workflows: (state.active_onboarding_workflows as string[]) ?? [],
    pricing_patterns: (state.pricing_patterns as Record<string, { avgPrice: number; count: number }>) ?? {},
    total_leads_processed: state.total_leads_processed as number | undefined,
    total_proposals_generated: state.total_proposals_generated as number | undefined,
    total_conversions: state.total_conversions as number | undefined,
  }
}

// ---------------------------------------------------------------------------
// Sales Role Implementation
// ---------------------------------------------------------------------------

/**
 * Sales role: owns the entire sales pipeline.
 *
 * Wraps the existing lead swarm (lead-swarm.ts), proposal bot
 * (proposal-bot.ts), and client onboarding (client-onboarding.ts)
 * as sub-components. Same "wrap, don't rewrite" pattern as Finance
 * and Comms roles. Proactive behaviors include:
 * - Classifying and qualifying inbound leads
 * - Generating proposals with pricing intelligence
 * - Following up on stale leads and proposals
 * - Automating client onboarding when leads convert
 * - Learning from win/loss patterns to improve approach
 * - Maintaining pipeline visibility with conversion metrics
 */
const salesRole: RoleImplementation = {
  type: 'sales',
  name: 'Sales',
  description: 'Owns the sales pipeline: lead qualification, proposals, nurture, onboarding, pipeline analytics',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const tag = `[sales-role:${ctx.orgId.slice(0, 8)}]`
    logger.info(`${tag} Evaluating...`)

    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const workflowsToStart: WorkflowDefinition[] = []
    const salesState = getSalesState(ctx.state.state ?? {})
    const now = new Date().toISOString()

    // -----------------------------------------------------------------------
    // 1. Run wrapped lead swarm tick (existing behavior -- wrap, don't rewrite)
    // -----------------------------------------------------------------------
    const leadResult = await runWrappedLeadTick(ctx)
    actions.push(...leadResult.actions)
    insights.push(...leadResult.insights)

    // -----------------------------------------------------------------------
    // 2. Run wrapped proposal bot tick (process approved sends, follow-ups)
    // -----------------------------------------------------------------------
    const proposalResult = await runWrappedProposalTick(ctx)
    actions.push(...proposalResult.actions)
    insights.push(...proposalResult.insights)

    // -----------------------------------------------------------------------
    // 3. Lead nurture -- follow up on stale leads/proposals (Plan 23-02)
    // -----------------------------------------------------------------------
    try {
      const nurtureConfig = {
        staleLeadDays: (ctx.config.config?.stale_lead_days as number) ?? 7,
        staleProposalDays: (ctx.config.config?.stale_proposal_days as number) ?? 3,
        maxNurtureAttempts: (ctx.config.config?.max_nurture_attempts as number) ?? 3,
      }

      // Check for stale leads
      const staleLeads = await checkStaleLeads(ctx.supabase, ctx.orgId, nurtureConfig.staleLeadDays)
      for (const lead of staleLeads) {
        const existingWf = salesState.active_nurture_workflows.includes(lead.id)
        if (existingWf) continue

        if (ctx.autonomyLevel === 'observer') {
          insights.push({
            summary: `Stale lead: ${lead.contactName} (${lead.score}, ${lead.daysSinceLastActivity} days inactive)`,
            details: {
              leadId: lead.id,
              contactName: lead.contactName,
              score: lead.score,
              daysSinceLastActivity: lead.daysSinceLastActivity,
            },
            priority: lead.score === 'hot' ? 'high' : 'medium',
          })
        } else {
          const wfDef = createNurtureWorkflow(lead, 'lead')
          workflowsToStart.push(wfDef)
          salesState.active_nurture_workflows.push(lead.id)

          actions.push({
            type: 'nurture_started',
            summary: `Started nurture workflow for stale lead: ${lead.contactName} (${lead.score})`,
            payload: {
              leadId: lead.id,
              contactName: lead.contactName,
              score: lead.score,
            },
            confidence: 0.8,
            reversible: true,
          })
        }
      }

      // Check for stale proposals
      const staleProposals = await checkStaleProposals(ctx.supabase, ctx.orgId, nurtureConfig.staleProposalDays)
      for (const proposal of staleProposals) {
        const existingWf = salesState.active_nurture_workflows.includes(proposal.id)
        if (existingWf) continue

        if (ctx.autonomyLevel === 'observer') {
          insights.push({
            summary: `Stale proposal: "${proposal.title}" for ${proposal.contactName} (sent ${proposal.daysSinceSent} days ago, not viewed)`,
            details: {
              proposalId: proposal.id,
              title: proposal.title,
              contactName: proposal.contactName,
              daysSinceSent: proposal.daysSinceSent,
            },
            priority: 'medium',
          })
        } else {
          const wfDef = createNurtureWorkflow(proposal, 'proposal')
          workflowsToStart.push(wfDef)
          salesState.active_nurture_workflows.push(proposal.id)

          actions.push({
            type: 'nurture_started',
            summary: `Started follow-up for stale proposal: "${proposal.title}" (${proposal.daysSinceSent} days)`,
            payload: {
              proposalId: proposal.id,
              title: proposal.title,
              contactName: proposal.contactName,
            },
            confidence: 0.85,
            reversible: true,
          })
        }
      }

      salesState.last_nurture_scan_at = now

      if (staleLeads.length > 0 || staleProposals.length > 0) {
        logger.info(`${tag} Nurture: ${staleLeads.length} stale leads, ${staleProposals.length} stale proposals`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Nurture scan failed: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 4. Client onboarding -- check for new conversions (Plan 23-02)
    // -----------------------------------------------------------------------
    try {
      const conversions = await checkNewConversions(ctx.supabase, ctx.orgId)

      for (const conversion of conversions) {
        const existingWf = salesState.active_onboarding_workflows.includes(conversion.proposalId)
        if (existingWf) continue

        const wfDef = createOnboardingWorkflow(conversion)
        workflowsToStart.push(wfDef)
        salesState.active_onboarding_workflows.push(conversion.proposalId)

        actions.push({
          type: 'onboarding_triggered',
          summary: `Lead converted: ${conversion.clientName} accepted proposal "${conversion.proposalTitle}". Onboarding started.`,
          payload: {
            proposalId: conversion.proposalId,
            clientName: conversion.clientName,
            projectType: conversion.projectType,
          },
          confidence: 1.0,
          reversible: false,
        })

        insights.push({
          summary: `Conversion: ${conversion.clientName} is now a client (${conversion.projectType})`,
          details: {
            proposalId: conversion.proposalId,
            projectType: conversion.projectType,
          },
          priority: 'high',
        })
      }

      salesState.last_onboarding_check_at = now

      if (conversions.length > 0) {
        logger.info(`${tag} Onboarding: ${conversions.length} new conversions detected`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Onboarding check failed: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 5. Win/loss analysis (weekly) (Plan 23-03)
    // -----------------------------------------------------------------------
    const winlossAge = salesState.last_winloss_analysis_at
      ? Date.now() - new Date(salesState.last_winloss_analysis_at).getTime()
      : Infinity
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

    if (winlossAge >= ONE_WEEK_MS) {
      try {
        const winlossResult = await analyzeWinLossPatterns(ctx.supabase, ctx.orgId)
        salesState.last_winloss_analysis_at = now

        // Update pricing patterns in state
        salesState.pricing_patterns = winlossResult.pricingPatterns

        // Surface learnings as insights
        for (const learning of winlossResult.learnings) {
          insights.push({
            summary: learning.summary,
            details: learning.details,
            priority: learning.priority,
          })
        }

        if (winlossResult.learnings.length > 0) {
          logger.info(`${tag} Win/loss: ${winlossResult.learnings.length} insights generated`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`${tag} Win/loss analysis failed: ${message}`)
      }
    }

    // -----------------------------------------------------------------------
    // 6. Pipeline snapshot (daily, cached in bi_snapshots) (Plan 23-03)
    // -----------------------------------------------------------------------
    const pipelineAge = salesState.last_pipeline_snapshot_at
      ? Date.now() - new Date(salesState.last_pipeline_snapshot_at).getTime()
      : Infinity
    const ONE_DAY_MS = 24 * 60 * 60 * 1000

    if (pipelineAge >= ONE_DAY_MS) {
      try {
        const pipeline = await computePipelineSnapshot(ctx.supabase, ctx.orgId)
        salesState.last_pipeline_snapshot_at = now

        // Surface pipeline summary as insight
        insights.push({
          summary: `Pipeline: ${pipeline.totalLeads} leads, ${pipeline.totalProposals} proposals, ` +
            `${pipeline.activeClients} active clients. Conversion rate: ${pipeline.conversionRate}%`,
          details: {
            totalLeads: pipeline.totalLeads,
            totalProposals: pipeline.totalProposals,
            activeClients: pipeline.activeClients,
            conversionRate: pipeline.conversionRate,
            pipelineValue: pipeline.pipelineValue,
            type: 'pipeline_snapshot',
          },
          priority: 'medium',
        })

        // Surface alerts from pipeline
        for (const alert of pipeline.alerts) {
          insights.push({
            summary: alert.summary,
            details: alert.details,
            priority: alert.priority,
          })
        }

        logger.info(`${tag} Pipeline: ${pipeline.totalLeads} leads, ${pipeline.conversionRate}% conversion`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`${tag} Pipeline snapshot failed: ${message}`)
      }
    }

    // -----------------------------------------------------------------------
    // 7. Build state updates
    // -----------------------------------------------------------------------
    const stateUpdates: Record<string, unknown> = {
      last_lead_tick_at: now,
      last_proposal_tick_at: now,
      last_nurture_scan_at: salesState.last_nurture_scan_at,
      last_onboarding_check_at: salesState.last_onboarding_check_at,
      last_winloss_analysis_at: salesState.last_winloss_analysis_at,
      last_pipeline_snapshot_at: salesState.last_pipeline_snapshot_at,
      active_nurture_workflows: salesState.active_nurture_workflows,
      active_onboarding_workflows: salesState.active_onboarding_workflows,
      pricing_patterns: salesState.pricing_patterns,
    }

    // Track cumulative stats
    const prevLeads = salesState.total_leads_processed ?? 0
    const prevProposals = salesState.total_proposals_generated ?? 0
    const prevConversions = salesState.total_conversions ?? 0

    const newLeads = leadResult.raw?.created ?? 0
    const newProposals = proposalResult.raw?.processed ?? 0
    const newConversions = actions.filter((a) => a.type === 'onboarding_triggered').length

    if (newLeads > 0) stateUpdates.total_leads_processed = prevLeads + newLeads
    if (newProposals > 0) stateUpdates.total_proposals_generated = prevProposals + newProposals
    if (newConversions > 0) stateUpdates.total_conversions = prevConversions + newConversions

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
    if (workflowType === 'lead_nurture' || workflowType === 'proposal_nurture') {
      return getNurtureStepDefs(workflowType)
    }
    if (workflowType === 'client_onboarding') {
      return getOnboardingStepDefs()
    }
    return []
  },

  getWorkflowStepDef(workflowType: string, stepId: string): Partial<WorkflowStepDef> | undefined {
    if (workflowType === 'lead_nurture' || workflowType === 'proposal_nurture') {
      return getNurtureStepDef(workflowType, stepId)
    }
    if (workflowType === 'client_onboarding') {
      return getOnboardingStepDef(stepId)
    }
    return undefined
  },

  // -------------------------------------------------------------------------
  // Haiku pre-screen: has anything changed since last tick?
  // -------------------------------------------------------------------------

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    const tag = `[sales-role:${ctx.orgId.slice(0, 8)}]`

    try {
      // Check 1: Any unprocessed inbound messages? (lead candidates)
      const { count: unprocessedCount, error: unprocessedError } = await ctx.supabase
        .from('channel_messages')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('processed', false)

      if (!unprocessedError && (unprocessedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${unprocessedCount} unprocessed messages (potential leads)`)
        return true
      }

      // Check 2: Any approved proposal actions waiting?
      const { count: approvedCount, error: approvedError } = await ctx.supabase
        .from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .in('action_type', ['proposal_send', 'proposal_follow_up', 'lead_ack', 'nurture_email'])
        .eq('status', 'approved')

      if (!approvedError && (approvedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${approvedCount} approved sales actions pending`)
        return true
      }

      // Check 3: Any new leads since last tick?
      const lastTickAt = ctx.state.last_tick_at
      if (lastTickAt) {
        const { count: newLeadCount, error: newLeadError } = await ctx.supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId)
          .gt('created_at', lastTickAt)

        if (!newLeadError && (newLeadCount ?? 0) > 0) {
          logger.info(`${tag} Pre-screen: ${newLeadCount} new leads since last tick`)
          return true
        }
      }

      // Check 4: Any proposals recently accepted? (conversion trigger)
      const { count: acceptedCount, error: acceptedError } = await ctx.supabase
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('status', 'accepted')

      if (!acceptedError && (acceptedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${acceptedCount} accepted proposals (potential conversions)`)
        return true
      }

      // Check 5: Any active nurture/onboarding workflows ready for next step?
      const { count: readyWfCount, error: wfError } = await ctx.supabase
        .from('role_workflows')
        .select('id', { count: 'exact', head: true })
        .eq('role_config_id', ctx.config.id)
        .eq('status', 'active')
        .lte('next_step_at', new Date().toISOString())

      if (!wfError && (readyWfCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${readyWfCount} sales workflows ready for next step`)
        return true
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
      tick_interval_seconds: 1800, // 30-min tick (sales is moderately time-sensitive)
      daily_budget_cents: 400,     // $4/day
      autonomy_level: 'copilot',
      config: {
        stale_lead_days: 7,
        stale_proposal_days: 3,
        max_nurture_attempts: 3,
        auto_onboarding_enabled: true,
      },
    }
  },
}

// Auto-register on import
registerRole(salesRole)

export { salesRole, getSalesState }
