import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowDefinition } from '../role-registry'
import type { WorkflowStepDef, WorkflowStepContext } from '../workflow-executor'
import {
  triggerOnboardingFromProposal,
  runOnboardingTick,
  type OnboardingTickResult,
} from '@/lib/agent/client-onboarding'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversionEvent {
  proposalId: string
  proposalTitle: string
  clientName: string
  clientContactId: string | null
  clientEmail: string | null
  projectType: string
  acceptedAt: string
}

export interface WrappedOnboardingTickResult {
  conversions: ConversionEvent[]
  onboardingTick: OnboardingTickResult | null
}

// ---------------------------------------------------------------------------
// Onboarding Schedule
// ---------------------------------------------------------------------------

const ONBOARDING_STEPS = [
  { stepId: 'trigger_onboarding', name: 'Create onboarding record and checklist', delayDays: 0 },
  { stepId: 'welcome_email', name: 'Send welcome email package', delayDays: 0 },
  { stepId: 'kickoff_scheduling', name: 'Send kickoff call scheduling link', delayDays: 1 },
  { stepId: 'credential_request', name: 'Request project credentials', delayDays: 2 },
  { stepId: 'project_setup', name: 'Create project board and initial tasks', delayDays: 3 },
] as const

// ---------------------------------------------------------------------------
// Conversion Detection
// ---------------------------------------------------------------------------

/**
 * Find proposals that have been accepted but don't yet have an onboarding
 * workflow running through the sales role. Delegates to the existing
 * client-onboarding.ts for the actual onboarding logic.
 */
export async function checkNewConversions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ConversionEvent[]> {
  const { data: accepted, error } = await supabase
    .from('proposals')
    .select('id, title, client_contact_id, project_type, accepted_at, metadata')
    .eq('org_id', orgId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(10)

  if (error || !accepted) return []

  const results: ConversionEvent[] = []

  for (const prop of accepted) {
    // Check if onboarding already exists for this proposal
    const { data: existing } = await supabase
      .from('onboardings')
      .select('id')
      .eq('org_id', orgId)
      .eq('proposal_id', prop.id)
      .limit(1)

    if (existing && existing.length > 0) continue

    // Also check role_workflows for a sales-role onboarding workflow
    const { count: wfCount } = await supabase
      .from('role_workflows')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_type', 'client_onboarding')
      .contains('context', { proposalId: prop.id })

    if ((wfCount ?? 0) > 0) continue

    // Resolve client info
    let clientName = 'Client'
    let clientEmail: string | null = null

    if (prop.client_contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, email')
        .eq('id', prop.client_contact_id)
        .single()

      if (contact) {
        clientName = contact.name || clientName
        clientEmail = contact.email || null
      }
    }

    results.push({
      proposalId: prop.id as string,
      proposalTitle: prop.title as string,
      clientName,
      clientContactId: prop.client_contact_id as string | null,
      clientEmail,
      projectType: prop.project_type as string,
      acceptedAt: (prop.accepted_at as string) || new Date().toISOString(),
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Onboarding Workflow Creation
// ---------------------------------------------------------------------------

/**
 * Create an onboarding workflow definition for a converted lead.
 * The workflow delegates to the existing client-onboarding.ts for
 * the actual work (creating records, sending emails, etc.).
 */
export function createOnboardingWorkflow(conversion: ConversionEvent): WorkflowDefinition {
  return {
    workflowType: 'client_onboarding',
    steps: ONBOARDING_STEPS.map((s) => ({
      stepId: s.stepId,
      name: s.name,
    })),
    context: {
      proposalId: conversion.proposalId,
      proposalTitle: conversion.proposalTitle,
      clientName: conversion.clientName,
      clientContactId: conversion.clientContactId,
      clientEmail: conversion.clientEmail,
      projectType: conversion.projectType,
    },
  }
}

// ---------------------------------------------------------------------------
// Workflow Step Execution Functions
// ---------------------------------------------------------------------------

async function executeTriggerOnboarding(
  ctx: WorkflowStepContext,
): Promise<{ success: boolean; result?: Record<string, unknown> }> {
  const wfCtx = ctx.workflow.context as Record<string, unknown>
  const proposalId = wfCtx.proposalId as string

  try {
    const record = await triggerOnboardingFromProposal(
      ctx.supabase,
      ctx.orgId,
      proposalId,
      ctx.roleConfig.id,
    )

    return {
      success: true,
      result: {
        onboardingId: record?.id ?? null,
        created: !!record,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[client-onboarding-wf] Trigger failed for proposal ${proposalId}: ${message}`)
    return { success: false, result: { error: message } }
  }
}

async function executeOnboardingStep(
  ctx: WorkflowStepContext,
  stepId: string,
): Promise<{ success: boolean; result?: Record<string, unknown> }> {
  // The existing onboarding tick handles welcome emails, credential reminders,
  // and project board creation. We run it and let it process the active onboarding.
  try {
    const result = await runOnboardingTick(
      ctx.supabase,
      ctx.orgId,
      ctx.roleConfig.id,
    )

    logger.info(
      `[client-onboarding-wf] Step ${stepId}: ` +
      `${result.welcomesSent} welcomes, ${result.credentialReminders} cred reminders, ` +
      `${result.projectsCreated} projects created`,
    )

    return {
      success: true,
      result: {
        stepId,
        welcomesSent: result.welcomesSent,
        credentialReminders: result.credentialReminders,
        projectsCreated: result.projectsCreated,
        failed: result.failed,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[client-onboarding-wf] Step ${stepId} failed: ${message}`)
    return { success: false, result: { error: message } }
  }
}

// ---------------------------------------------------------------------------
// Workflow Step Definitions
// ---------------------------------------------------------------------------

export function getOnboardingStepDefs(): WorkflowStepDef[] {
  return ONBOARDING_STEPS.map((s) => ({
    id: s.stepId,
    name: s.name,
    delaySeconds: s.delayDays * 24 * 60 * 60,
    execute: async (ctx: WorkflowStepContext) => {
      if (s.stepId === 'trigger_onboarding') {
        return executeTriggerOnboarding(ctx)
      }
      return executeOnboardingStep(ctx, s.stepId)
    },
  }))
}

export function getOnboardingStepDef(stepId: string): Partial<WorkflowStepDef> | undefined {
  const step = ONBOARDING_STEPS.find((s) => s.stepId === stepId)
  if (!step) return undefined

  return {
    id: step.stepId,
    name: step.name,
    delaySeconds: step.delayDays * 24 * 60 * 60,
    execute: async (ctx: WorkflowStepContext) => {
      if (step.stepId === 'trigger_onboarding') {
        return executeTriggerOnboarding(ctx)
      }
      return executeOnboardingStep(ctx, step.stepId)
    },
  }
}
