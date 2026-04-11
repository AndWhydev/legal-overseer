import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleConfig, RoleWorkflow, WorkflowStatus, WorkflowStep } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStepDef {
  id: string
  name: string
  execute: (ctx: WorkflowStepContext) => Promise<WorkflowStepResult>
  delaySeconds?: number
  condition?: (ctx: WorkflowStepContext) => boolean
}

export interface WorkflowStepContext {
  supabase: SupabaseClient
  orgId: string
  roleConfig: RoleConfig
  workflow: RoleWorkflow
  stepResults: Record<string, unknown>
}

export interface WorkflowStepResult {
  success: boolean
  result?: unknown
  error?: string
  nextStepDelay?: number
}

export interface WorkflowDefinition {
  type: string
  steps: WorkflowStepDef[]
  context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Start Workflow
// ---------------------------------------------------------------------------

/**
 * Start a new workflow -- creates DB record, executes first eligible step.
 *
 * Creates a role_workflows row with all steps in pending state,
 * then immediately executes the first eligible step (or schedules
 * a delayed start if step 0 has a delay).
 */
export async function startWorkflow(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  definition: WorkflowDefinition,
): Promise<RoleWorkflow> {
  const tag = `[workflow:${definition.type}:${roleConfig.org_id.slice(0, 8)}]`

  // Build initial steps array from definitions
  const steps: WorkflowStep[] = definition.steps.map((def) => ({
    step_id: def.id,
    name: def.name,
    status: 'pending' as const,
  }))

  const now = new Date().toISOString()

  // Insert workflow record
  const { data: workflow, error } = await supabase
    .from('role_workflows')
    .insert({
      role_config_id: roleConfig.id,
      org_id: roleConfig.org_id,
      workflow_type: definition.type,
      status: 'active' as WorkflowStatus,
      steps,
      current_step: 0,
      context: definition.context,
      started_at: now,
      next_step_at: now, // eligible immediately unless first step has delay
    })
    .select('*')
    .single()

  if (error || !workflow) {
    const msg = error?.message ?? 'Unknown error creating workflow'
    logger.error(`${tag} Failed to create workflow: ${msg}`)
    throw new Error(`Failed to create workflow: ${msg}`)
  }

  const wf = workflow as RoleWorkflow
  logger.info(`${tag} Started workflow ${wf.id} with ${steps.length} steps`)

  // Log activity
  await logWorkflowActivity(supabase, roleConfig, wf, 'workflow_step', `Workflow started: ${definition.type}`)

  // Check if first step has a delay
  const firstStep = definition.steps[0]
  if (firstStep?.delaySeconds && firstStep.delaySeconds > 0) {
    // Schedule first step for later
    const nextStepAt = new Date(Date.now() + firstStep.delaySeconds * 1000).toISOString()
    const { data: updated } = await supabase
      .from('role_workflows')
      .update({ next_step_at: nextStepAt })
      .eq('id', wf.id)
      .select('*')
      .single()

    logger.info(`${tag} First step delayed by ${firstStep.delaySeconds}s`)
    return (updated as RoleWorkflow) ?? wf
  }

  // Execute first eligible step
  return await executeNextStep(supabase, wf, roleConfig, definition.steps)
}

// ---------------------------------------------------------------------------
// Resume Workflow
// ---------------------------------------------------------------------------

/**
 * Resume a paused/active workflow -- picks up from current_step.
 * Called during role tick when next_step_at <= now.
 */
export async function resumeWorkflow(
  supabase: SupabaseClient,
  workflow: RoleWorkflow,
  roleConfig: RoleConfig,
  stepDefs: WorkflowStepDef[],
): Promise<RoleWorkflow> {
  const tag = `[workflow:${workflow.workflow_type}:${workflow.id.slice(0, 8)}]`

  // Verify workflow is still active
  if (workflow.status !== 'active') {
    logger.info(`${tag} Workflow status is ${workflow.status}, skipping resume`)
    return workflow
  }

  // Check if it's time to run the next step
  if (workflow.next_step_at) {
    const nextStepAt = new Date(workflow.next_step_at).getTime()
    if (nextStepAt > Date.now()) {
      logger.info(`${tag} Next step not due yet (${workflow.next_step_at})`)
      return workflow
    }
  }

  logger.info(`${tag} Resuming at step ${workflow.current_step}`)
  return await executeNextStep(supabase, workflow, roleConfig, stepDefs)
}

// ---------------------------------------------------------------------------
// Cancel Workflow
// ---------------------------------------------------------------------------

/**
 * Cancel a workflow -- sets status to 'cancelled'.
 */
export async function cancelWorkflow(
  supabase: SupabaseClient,
  workflowId: string,
): Promise<void> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('role_workflows')
    .update({
      status: 'cancelled' as WorkflowStatus,
      completed_at: now,
    })
    .eq('id', workflowId)

  if (error) {
    logger.error(`[workflow] Failed to cancel workflow ${workflowId}: ${error.message}`)
    throw new Error(`Failed to cancel workflow: ${error.message}`)
  }

  logger.info(`[workflow] Cancelled workflow ${workflowId}`)
}

// ---------------------------------------------------------------------------
// Get Active Workflows
// ---------------------------------------------------------------------------

/**
 * Fetch active workflows for a role config that are ready for their next step.
 */
export async function getReadyWorkflows(
  supabase: SupabaseClient,
  roleConfigId: string,
): Promise<RoleWorkflow[]> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('role_workflows')
    .select('*')
    .eq('role_config_id', roleConfigId)
    .eq('status', 'active')
    .lte('next_step_at', now)

  if (error) {
    logger.warn(`[workflow] Failed to fetch ready workflows: ${error.message}`)
    return []
  }

  return (data ?? []) as RoleWorkflow[]
}

// ---------------------------------------------------------------------------
// Internal: Execute Next Step
// ---------------------------------------------------------------------------

async function executeNextStep(
  supabase: SupabaseClient,
  workflow: RoleWorkflow,
  roleConfig: RoleConfig,
  stepDefs: WorkflowStepDef[],
): Promise<RoleWorkflow> {
  const tag = `[workflow:${workflow.workflow_type}:${workflow.id.slice(0, 8)}]`
  const stepIndex = workflow.current_step

  // Check if all steps are done
  if (stepIndex >= stepDefs.length) {
    return await completeWorkflow(supabase, workflow, roleConfig)
  }

  const stepDef = stepDefs[stepIndex]
  if (!stepDef) {
    return await completeWorkflow(supabase, workflow, roleConfig)
  }

  // Build step results from prior steps
  const stepResults: Record<string, unknown> = {}
  for (const step of workflow.steps) {
    if (step.result !== undefined) {
      stepResults[step.step_id] = step.result
    }
  }

  const ctx: WorkflowStepContext = {
    supabase,
    orgId: roleConfig.org_id,
    roleConfig,
    workflow,
    stepResults,
  }

  // Check condition (skip if returns false)
  if (stepDef.condition && !stepDef.condition(ctx)) {
    logger.info(`${tag} Step ${stepIndex} (${stepDef.name}) skipped by condition`)

    // Mark step as skipped
    const updatedSteps = [...workflow.steps]
    if (updatedSteps[stepIndex]) {
      updatedSteps[stepIndex] = {
        ...updatedSteps[stepIndex],
        status: 'skipped',
        completed_at: new Date().toISOString(),
      }
    }

    // Advance to next step
    const nextStep = stepIndex + 1
    const { data: updated } = await supabase
      .from('role_workflows')
      .update({
        steps: updatedSteps,
        current_step: nextStep,
        next_step_at: new Date().toISOString(),
      })
      .eq('id', workflow.id)
      .select('*')
      .single()

    const updatedWf = (updated as RoleWorkflow) ?? { ...workflow, steps: updatedSteps, current_step: nextStep }

    await logWorkflowActivity(supabase, roleConfig, updatedWf, 'workflow_step', `Step skipped: ${stepDef.name} (condition not met)`)

    // Continue to next step immediately
    return await executeNextStep(supabase, updatedWf, roleConfig, stepDefs)
  }

  // Execute the step
  logger.info(`${tag} Executing step ${stepIndex}: ${stepDef.name}`)

  // Mark step as active
  const activeSteps = [...workflow.steps]
  if (activeSteps[stepIndex]) {
    activeSteps[stepIndex] = {
      ...activeSteps[stepIndex],
      status: 'active',
      started_at: new Date().toISOString(),
    }
  }
  await supabase
    .from('role_workflows')
    .update({ steps: activeSteps })
    .eq('id', workflow.id)

  try {
    const result = await stepDef.execute(ctx)

    if (!result.success) {
      // Step failed -- mark workflow as failed
      return await failWorkflow(supabase, workflow, roleConfig, stepIndex, stepDef.name, result.error ?? 'Step execution failed')
    }

    // Step succeeded -- save result and advance
    const completedSteps = [...activeSteps]
    if (completedSteps[stepIndex]) {
      completedSteps[stepIndex] = {
        ...completedSteps[stepIndex],
        status: 'completed',
        result: result.result,
        completed_at: new Date().toISOString(),
      }
    }

    const nextStepIndex = stepIndex + 1
    const isLastStep = nextStepIndex >= stepDefs.length

    if (isLastStep) {
      // All steps done
      const { data: completed } = await supabase
        .from('role_workflows')
        .update({
          steps: completedSteps,
          current_step: nextStepIndex,
          status: 'completed' as WorkflowStatus,
          completed_at: new Date().toISOString(),
          next_step_at: null,
        })
        .eq('id', workflow.id)
        .select('*')
        .single()

      const completedWf = (completed as RoleWorkflow) ?? { ...workflow, steps: completedSteps, status: 'completed' as WorkflowStatus }

      await logWorkflowActivity(supabase, roleConfig, completedWf, 'workflow_step', `Step completed: ${stepDef.name}`)
      await logWorkflowActivity(supabase, roleConfig, completedWf, 'workflow_step', `Workflow completed: ${workflow.workflow_type}`)

      // Send push notification on workflow completion (fire-and-forget)
      notifyWorkflowComplete(roleConfig.org_id, workflow.workflow_type, workflow.id)

      logger.info(`${tag} Workflow completed`)
      return completedWf
    }

    // More steps to go -- check if next step has delay
    const nextStepDef = stepDefs[nextStepIndex]
    const delay = result.nextStepDelay ?? nextStepDef?.delaySeconds ?? 0

    if (delay > 0) {
      // Schedule next step for later
      const nextStepAt = new Date(Date.now() + delay * 1000).toISOString()

      const { data: paused } = await supabase
        .from('role_workflows')
        .update({
          steps: completedSteps,
          current_step: nextStepIndex,
          next_step_at: nextStepAt,
        })
        .eq('id', workflow.id)
        .select('*')
        .single()

      const pausedWf = (paused as RoleWorkflow) ?? { ...workflow, steps: completedSteps, current_step: nextStepIndex, next_step_at: nextStepAt }

      await logWorkflowActivity(supabase, roleConfig, pausedWf, 'workflow_step', `Step completed: ${stepDef.name}. Next step delayed by ${delay}s`)

      logger.info(`${tag} Step ${stepIndex} done, next step delayed by ${delay}s`)
      return pausedWf
    }

    // No delay -- continue immediately
    const { data: advanced } = await supabase
      .from('role_workflows')
      .update({
        steps: completedSteps,
        current_step: nextStepIndex,
        next_step_at: new Date().toISOString(),
      })
      .eq('id', workflow.id)
      .select('*')
      .single()

    const advancedWf = (advanced as RoleWorkflow) ?? { ...workflow, steps: completedSteps, current_step: nextStepIndex }

    await logWorkflowActivity(supabase, roleConfig, advancedWf, 'workflow_step', `Step completed: ${stepDef.name}`)

    return await executeNextStep(supabase, advancedWf, roleConfig, stepDefs)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return await failWorkflow(supabase, workflow, roleConfig, stepIndex, stepDef.name, message)
  }
}

// ---------------------------------------------------------------------------
// Internal: Complete / Fail helpers
// ---------------------------------------------------------------------------

async function completeWorkflow(
  supabase: SupabaseClient,
  workflow: RoleWorkflow,
  roleConfig: RoleConfig,
): Promise<RoleWorkflow> {
  const now = new Date().toISOString()

  const { data: completed } = await supabase
    .from('role_workflows')
    .update({
      status: 'completed' as WorkflowStatus,
      completed_at: now,
      next_step_at: null,
    })
    .eq('id', workflow.id)
    .select('*')
    .single()

  const result = (completed as RoleWorkflow) ?? { ...workflow, status: 'completed' as WorkflowStatus, completed_at: now }

  await logWorkflowActivity(supabase, roleConfig, result, 'workflow_step', `Workflow completed: ${workflow.workflow_type}`)

  // Send push notification to org users on workflow completion (fire-and-forget)
  notifyWorkflowComplete(roleConfig.org_id, workflow.workflow_type, result.id)

  logger.info(`[workflow:${workflow.workflow_type}:${workflow.id.slice(0, 8)}] Workflow completed`)
  return result
}

async function failWorkflow(
  supabase: SupabaseClient,
  workflow: RoleWorkflow,
  roleConfig: RoleConfig,
  stepIndex: number,
  stepName: string,
  errorMessage: string,
): Promise<RoleWorkflow> {
  const tag = `[workflow:${workflow.workflow_type}:${workflow.id.slice(0, 8)}]`
  const now = new Date().toISOString()

  // Mark step as failed
  const failedSteps = [...workflow.steps]
  if (failedSteps[stepIndex]) {
    failedSteps[stepIndex] = {
      ...failedSteps[stepIndex],
      status: 'failed',
      completed_at: now,
    }
  }

  const { data: failed } = await supabase
    .from('role_workflows')
    .update({
      steps: failedSteps,
      status: 'failed' as WorkflowStatus,
      error: errorMessage,
      completed_at: now,
      next_step_at: null,
    })
    .eq('id', workflow.id)
    .select('*')
    .single()

  const result = (failed as RoleWorkflow) ?? { ...workflow, steps: failedSteps, status: 'failed' as WorkflowStatus, error: errorMessage }

  await logWorkflowActivity(
    supabase, roleConfig, result, 'error',
    `Workflow failed at step ${stepIndex} (${stepName}): ${errorMessage}`,
  )

  logger.error(`${tag} Failed at step ${stepIndex} (${stepName}): ${errorMessage}`)
  return result
}

// ---------------------------------------------------------------------------
// Internal: Activity logging helper
// ---------------------------------------------------------------------------

/**
 * Send push notification when a workflow completes.
 * Uses lazy import + fire-and-forget -- workflow execution must not fail if push fails.
 */
function notifyWorkflowComplete(orgId: string, workflowType: string, workflowId: string): void {
  import('@/lib/notifications/push-dispatcher').then(async ({ sendPushToUser }) => {
    const { getServiceClient } = await import('@/lib/supabase/service-client')
    const supabase = getServiceClient()

    // Find org users to notify
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)

    const cleanType = workflowType.replace(/^workflow_rule:/, '')
    for (const profile of profiles ?? []) {
      sendPushToUser(profile.id, {
        title: 'Workflow Complete',
        body: `${cleanType} finished`,
        data: { type: 'workflow', id: workflowId },
      }).catch(() => {})
    }
  }).catch((err) => {
    logger.warn('[workflow-executor] Push notification for workflow completion failed', { err })
  })
}

async function logWorkflowActivity(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  workflow: RoleWorkflow,
  activityType: string,
  summary: string,
): Promise<void> {
  const { error } = await supabase.from('role_activity').insert({
    role_config_id: roleConfig.id,
    org_id: roleConfig.org_id,
    activity_type: activityType,
    summary,
    details: {
      workflow_id: workflow.id,
      workflow_type: workflow.workflow_type,
      current_step: workflow.current_step,
      status: workflow.status,
    },
    autonomy_mode: roleConfig.autonomy_level,
    reversible: false,
  })

  if (error) {
    logger.warn(`[workflow] Failed to log activity: ${error.message}`)
  }
}
