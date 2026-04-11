import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowDefinition } from '../role-registry'
import type { WorkflowStepDef, WorkflowStepContext } from '../workflow-executor'
import { createApproval } from '@/lib/agent/approval-queue'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaleLead {
  id: string
  contactName: string
  contactEmail: string | null
  score: string
  status: string
  daysSinceLastActivity: number
  sourceChannel: string
  nurtureAttempts: number
}

export interface StaleProposal {
  id: string
  title: string
  contactName: string
  contactEmail: string | null
  clientContactId: string | null
  daysSinceSent: number
  followUpCount: number
}

// ---------------------------------------------------------------------------
// Nurture Schedule: configurable multi-step cadence
// ---------------------------------------------------------------------------

/**
 * Lead nurture: gentle check-in (d7), value add (d14), final reach-out (d21)
 * Proposal nurture: soft follow-up (d3), case-study (d7), last chance (d14)
 */
export const NURTURE_SCHEDULE = {
  lead_nurture: [
    { stepId: 'gentle_checkin', name: 'Gentle check-in', delayDays: 0 },
    { stepId: 'value_add', name: 'Share relevant value (case study / resource)', delayDays: 7 },
    { stepId: 'final_outreach', name: 'Final outreach with deadline', delayDays: 14 },
  ],
  proposal_nurture: [
    { stepId: 'soft_follow_up', name: 'Soft follow-up on proposal', delayDays: 0 },
    { stepId: 'case_study', name: 'Share similar project case study', delayDays: 4 },
    { stepId: 'last_chance', name: 'Last-chance offer with expiry', delayDays: 7 },
  ],
} as const

// ---------------------------------------------------------------------------
// Stale Lead Detection
// ---------------------------------------------------------------------------

/**
 * Find qualified leads that have gone cold (no activity in N days).
 * Returns leads that are eligible for nurture (not already in a nurture workflow).
 */
export async function checkStaleLeads(
  supabase: SupabaseClient,
  orgId: string,
  staleDays: number,
): Promise<StaleLead[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - staleDays)

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, source_channel, source_detail, status, score, created_at, updated_at, metadata')
    .eq('org_id', orgId)
    .in('status', ['qualified', 'contacted'])
    .lt('updated_at', cutoff.toISOString())
    .order('updated_at', { ascending: true })
    .limit(20)

  if (error || !leads) return []

  const results: StaleLead[] = []

  for (const lead of leads) {
    const metadata = (lead.metadata ?? {}) as Record<string, unknown>
    const nurtureAttempts = (metadata.nurture_attempts as number) ?? 0

    // Skip if already max nurtured
    if (nurtureAttempts >= 3) continue

    const updatedAt = lead.updated_at as string
    const daysSince = Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24),
    )

    results.push({
      id: lead.id as string,
      contactName: (lead.source_detail as string) || 'Unknown',
      contactEmail: (lead.source_detail as string)?.includes('@')
        ? (lead.source_detail as string)
        : null,
      score: (lead.score as string) || 'cold',
      status: lead.status as string,
      daysSinceLastActivity: daysSince,
      sourceChannel: (lead.source_channel as string) || 'unknown',
      nurtureAttempts,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Stale Proposal Detection
// ---------------------------------------------------------------------------

/**
 * Find proposals that were sent but not viewed/accepted after N days.
 */
export async function checkStaleProposals(
  supabase: SupabaseClient,
  orgId: string,
  staleDays: number,
): Promise<StaleProposal[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - staleDays)

  const { data: proposals, error } = await supabase
    .from('proposals')
    .select('id, title, client_contact_id, sent_at, metadata')
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .lt('sent_at', cutoff.toISOString())
    .order('sent_at', { ascending: true })
    .limit(20)

  if (error || !proposals) return []

  const results: StaleProposal[] = []

  for (const prop of proposals) {
    const metadata = (prop.metadata ?? {}) as Record<string, unknown>
    const followUpCount = (metadata.follow_up_count as number) ?? 0

    // Skip if already max follow-ups (proposal-bot handles its own)
    if (followUpCount >= 2) continue

    const sentAt = prop.sent_at as string
    const daysSince = Math.floor(
      (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60 * 24),
    )

    // Resolve contact name
    let contactName = 'Unknown'
    let contactEmail: string | null = null
    if (prop.client_contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, email')
        .eq('id', prop.client_contact_id)
        .single()

      if (contact) {
        contactName = contact.name || contactName
        contactEmail = contact.email || null
      }
    }

    results.push({
      id: prop.id as string,
      title: prop.title as string,
      contactName,
      contactEmail,
      clientContactId: prop.client_contact_id as string | null,
      daysSinceSent: daysSince,
      followUpCount,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Nurture Workflow Creation
// ---------------------------------------------------------------------------

/**
 * Create a nurture workflow definition for either a stale lead or proposal.
 */
export function createNurtureWorkflow(
  target: StaleLead | StaleProposal,
  targetType: 'lead' | 'proposal',
): WorkflowDefinition {
  const schedule = targetType === 'lead'
    ? NURTURE_SCHEDULE.lead_nurture
    : NURTURE_SCHEDULE.proposal_nurture

  return {
    workflowType: `${targetType}_nurture`,
    steps: schedule.map((s) => ({
      stepId: s.stepId,
      name: s.name,
    })),
    context: {
      targetType,
      targetId: target.id,
      contactName: target.contactName,
      contactEmail: 'contactEmail' in target ? target.contactEmail : null,
      ...(targetType === 'lead'
        ? { score: (target as StaleLead).score, sourceChannel: (target as StaleLead).sourceChannel }
        : { title: (target as StaleProposal).title, clientContactId: (target as StaleProposal).clientContactId }),
    },
  }
}

// ---------------------------------------------------------------------------
// Workflow Step Execution Functions
// ---------------------------------------------------------------------------

async function executeNurtureStep(
  ctx: WorkflowStepContext,
  stepId: string,
  nurtureType: string,
): Promise<{ success: boolean; result?: Record<string, unknown> }> {
  const wfCtx = ctx.workflow.context as Record<string, unknown>
  const contactName = wfCtx.contactName as string
  const contactEmail = wfCtx.contactEmail as string | null
  const targetId = wfCtx.targetId as string

  if (!contactEmail) {
    logger.warn(`[lead-nurture] No email for ${contactName}, skipping nurture step ${stepId}`)
    return { success: true, result: { skipped: true, reason: 'no_email' } }
  }

  // Queue nurture email through approval queue
  const summaryMap: Record<string, string> = {
    // Lead nurture steps
    gentle_checkin: `Gentle check-in with ${contactName} about their project inquiry`,
    value_add: `Share relevant case study / resource with ${contactName}`,
    final_outreach: `Final outreach to ${contactName} with project deadline`,
    // Proposal nurture steps
    soft_follow_up: `Soft follow-up on proposal for ${contactName}`,
    case_study: `Share similar project case study with ${contactName}`,
    last_chance: `Last-chance offer with expiry for ${contactName}`,
  }

  try {
    await createApproval(ctx.supabase, {
      org_id: ctx.orgId,
      agent_config_id: ctx.roleConfig.id,
      action_type: 'nurture_email',
      action_payload: {
        target_type: nurtureType.replace('_nurture', ''),
        target_id: targetId,
        step_id: stepId,
        contact_name: contactName,
        contact_email: contactEmail,
      },
      action_summary: summaryMap[stepId] ?? `Nurture step: ${stepId} for ${contactName}`,
      confidence_score: 0,
      routing_decision: 'ask',
      priority: 'normal',
      context_snapshot: {
        source: 'sales-role-nurture',
        targetId,
        nurtureType,
        stepId,
      },
    })

    // Update nurture attempt count on the source record
    if (nurtureType === 'lead_nurture') {
      const { data: lead } = await ctx.supabase
        .from('leads')
        .select('metadata')
        .eq('id', targetId)
        .single()

      if (lead) {
        const metadata = (lead.metadata ?? {}) as Record<string, unknown>
        await ctx.supabase
          .from('leads')
          .update({
            metadata: {
              ...metadata,
              nurture_attempts: ((metadata.nurture_attempts as number) ?? 0) + 1,
              last_nurture_at: new Date().toISOString(),
              last_nurture_step: stepId,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetId)
      }
    }

    return { success: true, result: { approvalQueued: true, stepId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[lead-nurture] Step ${stepId} failed: ${message}`)
    return { success: false, result: { error: message } }
  }
}

// ---------------------------------------------------------------------------
// Workflow Step Definitions
// ---------------------------------------------------------------------------

export function getNurtureStepDefs(workflowType: string): WorkflowStepDef[] {
  const schedule = workflowType === 'lead_nurture'
    ? NURTURE_SCHEDULE.lead_nurture
    : NURTURE_SCHEDULE.proposal_nurture

  return schedule.map((s) => ({
    id: s.stepId,
    name: s.name,
    delaySeconds: s.delayDays * 24 * 60 * 60,
    execute: async (ctx: WorkflowStepContext) =>
      executeNurtureStep(ctx, s.stepId, workflowType),
  }))
}

export function getNurtureStepDef(
  workflowType: string,
  stepId: string,
): Partial<WorkflowStepDef> | undefined {
  const schedule = workflowType === 'lead_nurture'
    ? NURTURE_SCHEDULE.lead_nurture
    : NURTURE_SCHEDULE.proposal_nurture

  const step = schedule.find((s) => s.stepId === stepId)
  if (!step) return undefined

  return {
    id: step.stepId,
    name: step.name,
    delaySeconds: step.delayDays * 24 * 60 * 60,
    execute: async (ctx: WorkflowStepContext) =>
      executeNurtureStep(ctx, step.stepId, workflowType),
  }
}
