/**
 * Swarm Executor — runs a swarm DAG to completion.
 *
 * Responsibilities:
 * - Create swarm run + step rows in DB
 * - Topological sort the DAG to determine execution order
 * - Execute steps respecting dependencies (parallel where possible)
 * - Track cost per step and aggregate
 * - Handle failures: mark failed, optionally roll back
 * - Publish messages between agents
 * - Advisory locks prevent duplicate execution of the same run
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SwarmDAG,
  SwarmRun,
  SwarmStep,
  SwarmStepDef,
  SwarmMessage,
  SwarmContext,
  SwarmResult,
  SwarmRunStatus,
  SwarmCondition,
} from './types'
import { getParticipant } from './participant-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Advisory Lock (same pattern as role-runtime)
// ---------------------------------------------------------------------------

function lockKeyFromId(uuid: string): number {
  // Use a different namespace than role locks (offset by 0x10000000)
  const hex = uuid.replace(/-/g, '').slice(0, 8)
  return ((parseInt(hex, 16) + 0x10000000) | 0)
}

async function acquireSwarmLock(supabase: SupabaseClient, runId: string): Promise<boolean> {
  const lockKey = lockKeyFromId(runId)
  try {
    const { data } = await supabase.rpc('pg_try_advisory_lock', { lock_key: lockKey }).maybeSingle()
    return data === true
  } catch {
    logger.warn(`[swarm-executor] Advisory lock unavailable for ${runId}, proceeding optimistically`)
    return true
  }
}

async function releaseSwarmLock(supabase: SupabaseClient, runId: string): Promise<void> {
  const lockKey = lockKeyFromId(runId)
  try {
    await supabase.rpc('pg_advisory_unlock', { lock_key: lockKey }).maybeSingle()
  } catch {
    // Best-effort — auto-released on session end
  }
}

// ---------------------------------------------------------------------------
// DAG Utilities
// ---------------------------------------------------------------------------

/**
 * Topological sort of DAG steps. Returns layers where each layer's steps
 * can execute in parallel (all deps satisfied by prior layers).
 */
export function topologicalLayers(steps: SwarmStepDef[]): SwarmStepDef[][] {
  const stepMap = new Map(steps.map(s => [s.step_id, s]))
  const completed = new Set<string>()
  const layers: SwarmStepDef[][] = []
  const remaining = new Set(steps.map(s => s.step_id))

  let maxIterations = steps.length + 1
  while (remaining.size > 0 && maxIterations-- > 0) {
    const layer: SwarmStepDef[] = []
    for (const stepId of remaining) {
      const step = stepMap.get(stepId)!
      const depsReady = step.depends_on.every(d => completed.has(d))
      if (depsReady) {
        layer.push(step)
      }
    }

    if (layer.length === 0) {
      // Circular dependency or unresolvable deps
      throw new Error(
        `Circular dependency detected in swarm DAG. Remaining: ${Array.from(remaining).join(', ')}`
      )
    }

    for (const step of layer) {
      completed.add(step.step_id)
      remaining.delete(step.step_id)
    }
    layers.push(layer)
  }

  return layers
}

// ---------------------------------------------------------------------------
// Condition Evaluator
// ---------------------------------------------------------------------------

function evaluateCondition(
  condition: SwarmCondition,
  stepOutputs: Map<string, Record<string, unknown>>,
): boolean {
  const [sourceStepId, outputKey] = condition.source.split('.')
  const stepOutput = stepOutputs.get(sourceStepId)
  if (!stepOutput) return false

  const actual = outputKey ? stepOutput[outputKey] : stepOutput

  switch (condition.operator) {
    case 'equals':
      return actual === condition.value
    case 'not_equals':
      return actual !== condition.value
    case 'contains':
      return typeof actual === 'string' && typeof condition.value === 'string'
        ? actual.includes(condition.value)
        : Array.isArray(actual)
          ? actual.includes(condition.value)
          : false
    case 'gt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual > condition.value
        : false
    case 'lt':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual < condition.value
        : false
    case 'truthy':
      return Boolean(actual)
    case 'falsy':
      return !actual
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Create Swarm Run
// ---------------------------------------------------------------------------

export interface CreateSwarmRunParams {
  orgId: string
  name: string
  dag: SwarmDAG
  inputParams?: Record<string, unknown>
  definitionId?: string
  templateId?: string
  triggeredBy?: string
  triggerInput?: string
}

/**
 * Create a new swarm run with step rows for each DAG step.
 */
export async function createSwarmRun(
  supabase: SupabaseClient,
  params: CreateSwarmRunParams,
): Promise<SwarmRun> {
  const { orgId, name, dag, inputParams = {}, definitionId, templateId, triggeredBy = 'manual', triggerInput } = params

  // Insert the run
  const { data: run, error: runError } = await supabase
    .from('swarm_runs')
    .insert({
      org_id: orgId,
      definition_id: definitionId ?? null,
      template_id: templateId ?? null,
      name,
      status: 'pending',
      input_params: inputParams,
      output: {},
      dag_snapshot: dag,
      total_cost_cents: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      triggered_by: triggeredBy,
      trigger_input: triggerInput ?? null,
    })
    .select('*')
    .single()

  if (runError || !run) {
    throw new Error(`Failed to create swarm run: ${runError?.message ?? 'unknown error'}`)
  }

  // Compute execution order via topological sort
  const layers = topologicalLayers(dag.steps)
  let executionOrder = 0

  // Insert steps
  const stepInserts = layers.flatMap(layer =>
    layer.map(stepDef => {
      const agent = dag.agents.find(a => a.id === stepDef.agent_id)
      return {
        swarm_run_id: run.id,
        org_id: orgId,
        step_id: stepDef.step_id,
        step_type: stepDef.step_type,
        agent_type: agent?.agent_type ?? stepDef.agent_id,
        status: 'pending',
        input: {},
        output: {},
        condition: stepDef.condition ?? null,
        rollback_action: null,
        cost_cents: 0,
        tokens_in: 0,
        tokens_out: 0,
        error: null,
        execution_order: executionOrder++,
        depends_on: stepDef.depends_on,
      }
    })
  )

  if (stepInserts.length > 0) {
    const { error: stepsError } = await supabase
      .from('swarm_steps')
      .insert(stepInserts)

    if (stepsError) {
      throw new Error(`Failed to create swarm steps: ${stepsError.message}`)
    }
  }

  return run as SwarmRun
}

// ---------------------------------------------------------------------------
// Execute Swarm Run
// ---------------------------------------------------------------------------

/**
 * Execute a swarm run to completion.
 *
 * This is the main orchestration loop:
 * 1. Acquire advisory lock
 * 2. Mark run as running
 * 3. For each layer in topological order:
 *    a. Resolve inputs from upstream outputs + swarm params
 *    b. For conditional steps, evaluate condition (skip if false)
 *    c. Execute all steps in the layer in parallel
 *    d. Publish messages from step results
 *    e. Update step rows with output/cost/status
 * 4. Aggregate cost and output
 * 5. Mark run as completed (or failed)
 * 6. Release lock
 */
export async function executeSwarmRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<SwarmRun> {
  const tag = `[swarm:${runId.slice(0, 8)}]`
  let lockAcquired = false

  try {
    // Acquire lock
    lockAcquired = await acquireSwarmLock(supabase, runId)
    if (!lockAcquired) {
      throw new Error('Another execution is already running for this swarm')
    }

    // Load the run
    const { data: run, error: runError } = await supabase
      .from('swarm_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (runError || !run) {
      throw new Error(`Swarm run not found: ${runId}`)
    }

    if (run.status !== 'pending' && run.status !== 'paused') {
      throw new Error(`Swarm run ${runId} is in status ${run.status}, cannot execute`)
    }

    const dag = run.dag_snapshot as SwarmDAG

    // Mark as running
    await supabase
      .from('swarm_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', runId)

    logger.info(`${tag} Starting swarm: ${run.name} (${dag.steps.length} steps)`)

    // Load all step rows
    const { data: stepRows } = await supabase
      .from('swarm_steps')
      .select('*')
      .eq('swarm_run_id', runId)
      .order('execution_order', { ascending: true })

    if (!stepRows || stepRows.length === 0) {
      throw new Error('No steps found for swarm run')
    }

    const stepRowMap = new Map(stepRows.map(s => [s.step_id as string, s as SwarmStep]))

    // Execute layers
    const layers = topologicalLayers(dag.steps)
    const stepOutputs = new Map<string, Record<string, unknown>>()
    let totalCostCents = 0
    let totalTokensIn = 0
    let totalTokensOut = 0
    let failed = false

    for (const layer of layers) {
      if (failed) break

      // Execute all steps in this layer in parallel
      const layerPromises = layer.map(async (stepDef) => {
        const stepRow = stepRowMap.get(stepDef.step_id)
        if (!stepRow) {
          logger.warn(`${tag} Step row not found for ${stepDef.step_id}`)
          return
        }

        // Check condition for conditional steps
        if (stepDef.step_type === 'conditional' && stepDef.condition) {
          const conditionMet = evaluateCondition(stepDef.condition, stepOutputs)
          if (!conditionMet) {
            logger.info(`${tag} Skipping conditional step ${stepDef.step_id}: condition not met`)
            await supabase
              .from('swarm_steps')
              .update({ status: 'skipped', completed_at: new Date().toISOString() })
              .eq('id', stepRow.id)
            return
          }
        }

        // Resolve input from upstream outputs and swarm params
        const input: Record<string, unknown> = { ...run.input_params }
        if (stepDef.input_mapping) {
          for (const [localKey, sourceRef] of Object.entries(stepDef.input_mapping)) {
            const [srcStepId, srcKey] = sourceRef.split('.')
            const srcOutput = stepOutputs.get(srcStepId)
            if (srcOutput && srcKey) {
              input[localKey] = srcOutput[srcKey]
            } else if (srcOutput) {
              input[localKey] = srcOutput
            }
          }
        }
        // Also include all upstream findings
        for (const depId of stepDef.depends_on) {
          const depOutput = stepOutputs.get(depId)
          if (depOutput) {
            input[`upstream_${depId}`] = depOutput
          }
        }

        // Get participant
        const participant = getParticipant(stepDef.agent_id) ?? getParticipant(
          dag.agents.find(a => a.id === stepDef.agent_id)?.agent_type ?? ''
        )

        if (!participant) {
          logger.warn(`${tag} No participant for agent ${stepDef.agent_id}, using generic executor`)
          // Mark as failed but don't stop the swarm for non-critical steps
          await supabase
            .from('swarm_steps')
            .update({
              status: 'failed',
              error: `No participant registered for agent type: ${stepDef.agent_id}`,
              completed_at: new Date().toISOString(),
            })
            .eq('id', stepRow.id)
          return
        }

        // Mark step as running
        await supabase
          .from('swarm_steps')
          .update({ status: 'running', input, started_at: new Date().toISOString() })
          .eq('id', stepRow.id)

        // Load findings from message bus
        const { data: findings } = await supabase
          .from('swarm_messages')
          .select('*')
          .eq('swarm_run_id', runId)
          .or(`to_step_id.eq.${stepDef.step_id},to_step_id.is.null`)
          .order('created_at', { ascending: true })

        // Build context
        const context: SwarmContext = {
          run: run as SwarmRun,
          step: { ...stepRow, input } as SwarmStep,
          stepDef,
          input,
          findings: (findings ?? []) as SwarmMessage[],
          orgId: run.org_id as string,
        }

        // Execute with timeout
        let result: SwarmResult
        const timeoutMs = (stepDef.timeout_seconds ?? 120) * 1000
        try {
          result = await Promise.race([
            participant.execute(context),
            new Promise<SwarmResult>((_, reject) =>
              setTimeout(() => reject(new Error('Step execution timed out')), timeoutMs)
            ),
          ])
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          logger.error(`${tag} Step ${stepDef.step_id} failed: ${errorMsg}`)

          await supabase
            .from('swarm_steps')
            .update({
              status: 'failed',
              error: errorMsg,
              completed_at: new Date().toISOString(),
            })
            .eq('id', stepRow.id)

          failed = true
          return
        }

        // Store outputs
        stepOutputs.set(stepDef.step_id, result.output)

        // Update step row
        const stepCost = result.cost_cents ?? 0
        const stepTokensIn = result.tokens_in ?? 0
        const stepTokensOut = result.tokens_out ?? 0
        totalCostCents += stepCost
        totalTokensIn += stepTokensIn
        totalTokensOut += stepTokensOut

        await supabase
          .from('swarm_steps')
          .update({
            status: result.success ? 'completed' : 'failed',
            output: result.output,
            rollback_action: result.rollback_action ?? null,
            cost_cents: stepCost,
            tokens_in: stepTokensIn,
            tokens_out: stepTokensOut,
            error: result.error ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', stepRow.id)

        // Publish messages
        if (result.messages && result.messages.length > 0) {
          const msgInserts = result.messages.map(msg => ({
            swarm_run_id: runId,
            org_id: run.org_id,
            from_step_id: stepDef.step_id,
            to_step_id: msg.to_step_id ?? null,
            message_type: msg.message_type,
            content: msg.content,
          }))

          await supabase.from('swarm_messages').insert(msgInserts)
        }

        if (!result.success) {
          failed = true
        }

        logger.info(`${tag} Step ${stepDef.step_id} completed (${result.success ? 'ok' : 'failed'})`)
      })

      await Promise.all(layerPromises)
    }

    // Aggregate output from all completed steps
    const aggregatedOutput: Record<string, unknown> = {}
    for (const [stepId, output] of stepOutputs) {
      aggregatedOutput[stepId] = output
    }

    // Update run with final status
    const finalStatus: SwarmRunStatus = failed ? 'failed' : 'completed'
    const { data: updatedRun, error: updateError } = await supabase
      .from('swarm_runs')
      .update({
        status: finalStatus,
        output: aggregatedOutput,
        total_cost_cents: totalCostCents,
        total_tokens_in: totalTokensIn,
        total_tokens_out: totalTokensOut,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select('*')
      .single()

    if (updateError) {
      logger.error(`${tag} Failed to update run status: ${updateError.message}`)
    }

    // If failed, attempt rollback
    if (failed) {
      logger.info(`${tag} Swarm failed, initiating rollback`)
      await rollbackSwarmRun(supabase, runId)
    }

    logger.info(`${tag} Swarm ${finalStatus}: ${totalCostCents}c, ${totalTokensIn + totalTokensOut} tokens`)

    return (updatedRun ?? run) as SwarmRun
  } finally {
    if (lockAcquired) {
      await releaseSwarmLock(supabase, runId)
    }
  }
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

/**
 * Roll back a swarm run by replaying rollback actions in reverse order.
 */
export async function rollbackSwarmRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<void> {
  const tag = `[swarm-rollback:${runId.slice(0, 8)}]`

  await supabase
    .from('swarm_runs')
    .update({ status: 'rolling_back' })
    .eq('id', runId)

  // Get completed steps in reverse execution order
  const { data: steps } = await supabase
    .from('swarm_steps')
    .select('*')
    .eq('swarm_run_id', runId)
    .eq('status', 'completed')
    .order('execution_order', { ascending: false })

  if (!steps || steps.length === 0) {
    logger.info(`${tag} No completed steps to roll back`)
    return
  }

  // Load the run for DAG info
  const { data: run } = await supabase
    .from('swarm_runs')
    .select('dag_snapshot')
    .eq('id', runId)
    .single()

  const dag = run?.dag_snapshot as SwarmDAG | undefined

  for (const step of steps) {
    if (!step.rollback_action) continue

    const stepDef = dag?.steps.find(s => s.step_id === step.step_id)
    const participant = getParticipant(step.agent_type)

    if (participant?.rollback && stepDef) {
      try {
        const context: SwarmContext = {
          run: { id: runId } as SwarmRun,
          step: step as SwarmStep,
          stepDef,
          input: step.input as Record<string, unknown>,
          findings: [],
          orgId: step.org_id as string,
        }

        const result = await participant.rollback(context)
        if (result.success) {
          await supabase
            .from('swarm_steps')
            .update({ status: 'rolled_back' })
            .eq('id', step.id)
          logger.info(`${tag} Rolled back step ${step.step_id}`)
        } else {
          logger.warn(`${tag} Rollback failed for step ${step.step_id}: ${result.error}`)
        }
      } catch (err) {
        logger.warn(`${tag} Rollback error for step ${step.step_id}: ${err}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/**
 * Cancel a running or pending swarm.
 */
export async function cancelSwarmRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<void> {
  // Cancel the run
  await supabase
    .from('swarm_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', runId)
    .in('status', ['pending', 'running', 'paused'])

  // Cancel pending steps
  await supabase
    .from('swarm_steps')
    .update({ status: 'skipped' })
    .eq('swarm_run_id', runId)
    .eq('status', 'pending')
}
