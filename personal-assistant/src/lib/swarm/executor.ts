/**
 * Swarm Executor
 *
 * DAG walker that executes swarm steps with parallel/sequential/conditional
 * handling, inter-agent message bus, and atomic rollback.
 *
 * Key patterns:
 * - Topological sort for dependency resolution
 * - Promise.allSettled for parallel execution
 * - Postgres advisory locks for execution safety
 * - Reversible action log for rollback
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SwarmDefinition,
  SwarmStepDefinition,
  SwarmStepResult,
  SwarmStepContext,
  SwarmRunStatus,
  SwarmStepStatus,
  SwarmMessageType,
  SwarmMessageRow,
  ReversibleAction,
  StepCondition,
  SwarmEvent,
} from './types'
import { SwarmAgent } from './agent'
import { logger } from '@/lib/core/logger'

// ── Executor ────────────────────────────────────────────────────────────────

export interface ExecutorConfig {
  orgId: string
  supabase: SupabaseClient
  runId: string
  definition: SwarmDefinition
  params: Record<string, unknown>
  onEvent?: (event: SwarmEvent) => void
}

export class SwarmExecutor {
  private config: ExecutorConfig
  private completedSteps: Map<string, Record<string, unknown>> = new Map()
  private stepStatuses: Map<string, SwarmStepStatus> = new Map()
  private allReversibleActions: ReversibleAction[] = []
  private totalCost = 0
  private totalTokensIn = 0
  private totalTokensOut = 0
  private aborted = false
  private startTime = 0

  constructor(config: ExecutorConfig) {
    this.config = config
  }

  /**
   * Execute the swarm DAG.
   * Returns the final status and result summary.
   */
  async execute(): Promise<{ status: SwarmRunStatus; summary: string | null }> {
    const { supabase, runId, definition, orgId, params } = this.config
    this.startTime = Date.now()
    const startedAt = new Date().toISOString()

    // Acquire advisory lock to prevent duplicate execution
    const lockAcquired = await this.acquireLock()
    if (!lockAcquired) {
      logger.warn('[swarm] Failed to acquire advisory lock', { runId })
      await this.updateRunStatus('failed', 'Failed to acquire execution lock — swarm may already be running')
      return { status: 'failed', summary: 'Duplicate execution prevented' }
    }

    try {
      // Update run status to executing
      await this.updateRunStatus('executing', undefined, startedAt)
      this.emit({ type: 'swarm_started', data: { runId, templateSlug: '', params } })

      // Create step rows in DB
      await this.createStepRows(definition.steps)

      // Topological execution
      const executionOrder = this.topologicalSort(definition.steps)

      for (const batch of executionOrder) {
        if (this.aborted) break

        // Check cost ceiling
        if (definition.governance.costCeiling && this.totalCost >= definition.governance.costCeiling) {
          logger.warn('[swarm] Cost ceiling reached', { runId, totalCost: this.totalCost, ceiling: definition.governance.costCeiling })
          await this.updateRunStatus('failed', `Cost ceiling reached: $${this.totalCost.toFixed(4)} >= $${definition.governance.costCeiling}`)
          return { status: 'failed', summary: `Cost ceiling exceeded ($${this.totalCost.toFixed(2)})` }
        }

        if (batch.length === 1) {
          // Sequential execution
          await this.executeStep(batch[0])
        } else {
          // Parallel execution
          await Promise.allSettled(
            batch.map(step => this.executeStep(step))
          )
        }
      }

      // Determine final status
      const allStatuses = Array.from(this.stepStatuses.values())
      const hasFailures = allStatuses.some(s => s === 'failed')
      const allCompleted = allStatuses.every(s => s === 'completed' || s === 'skipped')

      let finalStatus: SwarmRunStatus
      let summary: string | null = null

      if (this.aborted) {
        finalStatus = 'failed'
        summary = 'Swarm execution was aborted'
      } else if (allCompleted) {
        finalStatus = 'completed'
        summary = this.buildSummary()
      } else if (hasFailures) {
        finalStatus = 'partial'
        summary = this.buildSummary()
      } else {
        finalStatus = 'completed'
        summary = this.buildSummary()
      }

      // Update run with results
      const durationMs = Date.now() - this.startTime
      await supabase
        .from('swarm_runs')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          total_cost: this.totalCost,
          total_tokens_in: this.totalTokensIn,
          total_tokens_out: this.totalTokensOut,
          result_summary: summary,
          result_data: Object.fromEntries(this.completedSteps),
          rollback_log: this.allReversibleActions,
        })
        .eq('id', runId)

      // Update template metrics
      if (this.config.params._templateId) {
        await this.updateTemplateMetrics(
          this.config.params._templateId as string,
          finalStatus === 'completed',
        )
      }

      this.emit({ type: 'swarm_completed', data: { runId, status: finalStatus, summary } })
      return { status: finalStatus, summary }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[swarm] Execution failed', { runId, error: errorMsg })
      await this.updateRunStatus('failed', errorMsg)
      this.emit({ type: 'swarm_failed', data: { runId, error: errorMsg } })
      return { status: 'failed', summary: errorMsg }
    } finally {
      await this.releaseLock()
    }
  }

  /**
   * Execute a single step.
   */
  private async executeStep(stepDef: SwarmStepDefinition): Promise<void> {
    const { supabase, runId, orgId, params } = this.config

    // Check if dependencies completed successfully
    if (stepDef.dependsOn && stepDef.dependsOn.length > 0) {
      const depsFailed = stepDef.dependsOn.some(
        dep => this.stepStatuses.get(dep) === 'failed'
      )
      if (depsFailed) {
        this.stepStatuses.set(stepDef.key, 'blocked')
        await this.updateStepStatus(stepDef.key, 'blocked', 'Blocked by failed dependency')
        return
      }
    }

    // Evaluate condition
    if (stepDef.condition) {
      const shouldRun = this.evaluateCondition(stepDef.condition)
      if (!shouldRun) {
        this.stepStatuses.set(stepDef.key, 'skipped')
        await this.updateStepStatus(stepDef.key, 'skipped')
        return
      }
    }

    // Mark as executing
    this.stepStatuses.set(stepDef.key, 'executing')
    await this.updateStepStatus(stepDef.key, 'executing')
    this.emit({ type: 'step_started', data: { runId, stepKey: stepDef.key, agentRole: stepDef.agentRole } })

    try {
      // Build prompt with parameter substitution
      const prompt = this.substituteParams(stepDef.prompt, params)

      // Gather upstream findings
      const upstreamFindings = await this.getUpstreamFindings(stepDef.key)

      // Build input data from completed dependencies
      const inputData: Record<string, unknown> = {}
      if (stepDef.dependsOn) {
        for (const dep of stepDef.dependsOn) {
          const depOutput = this.completedSteps.get(dep)
          if (depOutput) {
            inputData[dep] = depOutput
          }
        }
      }

      // Build step context
      const context: SwarmStepContext = {
        orgId,
        runId,
        stepKey: stepDef.key,
        inputData,
        upstreamFindings,
        triggerParams: params,
        completedSteps: Object.fromEntries(this.completedSteps),
      }

      // Create and execute agent
      const agent = new SwarmAgent({
        role: stepDef.agentRole,
        persona: stepDef.persona,
        capabilities: stepDef.capabilities,
        modelTier: stepDef.modelTier,
        supabase,
        orgId,
      })

      const result = await agent.execute(prompt, context)

      // Process result
      if (result.success) {
        this.stepStatuses.set(stepDef.key, 'completed')
        this.completedSteps.set(stepDef.key, result.data || {})

        // Track costs
        if (result.cost) {
          this.totalCost += result.cost
          this.emit({ type: 'cost_update', data: { runId, totalCost: this.totalCost, stepKey: stepDef.key, stepCost: result.cost } })
        }
        if (result.tokensIn) this.totalTokensIn += result.tokensIn
        if (result.tokensOut) this.totalTokensOut += result.tokensOut

        // Track reversible actions
        if (result.reversibleActions) {
          this.allReversibleActions.push(...result.reversibleActions)
        }

        // Post messages to bus
        if (result.messages) {
          for (const msg of result.messages) {
            await this.postMessage(stepDef.key, null, msg.type, msg.content, msg.data)
          }
        }

        // Post completion message
        await this.postMessage(
          stepDef.key,
          null,
          'completion',
          `Step "${stepDef.label}" completed successfully`,
          result.data
        )

        // Update step in DB
        await supabase
          .from('swarm_steps')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: result.data || {},
            cost_estimate: result.cost || 0,
            tokens_in: result.tokensIn || 0,
            tokens_out: result.tokensOut || 0,
            model_used: result.modelUsed || null,
            reversible_actions: result.reversibleActions || null,
          })
          .eq('run_id', runId)
          .eq('step_key', stepDef.key)

        this.emit({ type: 'step_completed', data: { runId, stepKey: stepDef.key, result } })

      } else if (result.negotiation) {
        // Agent pushed back
        this.stepStatuses.set(stepDef.key, 'negotiating')
        await this.updateStepStatus(stepDef.key, 'negotiating')

        await supabase
          .from('swarm_steps')
          .update({
            status: 'negotiating',
            negotiation: result.negotiation,
          })
          .eq('run_id', runId)
          .eq('step_key', stepDef.key)

        this.emit({ type: 'negotiation_started', data: { runId, stepKey: stepDef.key, negotiation: result.negotiation } })

        // Post negotiation message
        await this.postMessage(
          stepDef.key,
          null,
          'negotiation',
          result.negotiation.counterProposal,
          { negotiation: result.negotiation }
        )

        // For now, mark as completed with the negotiation result
        // In the future, the coordinator would resolve this
        this.stepStatuses.set(stepDef.key, 'completed')
        this.completedSteps.set(stepDef.key, {
          negotiated: true,
          ...result.negotiation.suggestedAlternative,
        })

      } else {
        // Step failed
        throw new Error(result.error || 'Unknown step failure')
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[swarm] Step failed', { runId, stepKey: stepDef.key, error: errorMsg })

      this.stepStatuses.set(stepDef.key, 'failed')
      await supabase
        .from('swarm_steps')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg,
        })
        .eq('run_id', runId)
        .eq('step_key', stepDef.key)

      // Post failure message
      await this.postMessage(
        stepDef.key,
        null,
        'warning',
        `Step "${stepDef.label}" failed: ${errorMsg}`,
      )

      this.emit({ type: 'step_failed', data: { runId, stepKey: stepDef.key, error: errorMsg } })
    }
  }

  /**
   * Topological sort: returns batches of steps that can run in parallel.
   * Each batch only depends on previously completed batches.
   */
  private topologicalSort(steps: SwarmStepDefinition[]): SwarmStepDefinition[][] {
    const batches: SwarmStepDefinition[][] = []
    const completed = new Set<string>()
    const remaining = new Map(steps.map(s => [s.key, s]))

    while (remaining.size > 0) {
      const batch: SwarmStepDefinition[] = []

      for (const [key, step] of remaining) {
        const deps = step.dependsOn || []
        const depsResolved = deps.every(d => completed.has(d))
        if (depsResolved) {
          batch.push(step)
        }
      }

      if (batch.length === 0) {
        // Circular dependency or unresolvable deps — run remaining sequentially
        logger.warn('[swarm] Unresolvable dependencies detected, running remaining sequentially')
        for (const step of remaining.values()) {
          batches.push([step])
        }
        break
      }

      for (const step of batch) {
        remaining.delete(step.key)
        completed.add(step.key)
      }

      batches.push(batch)
    }

    return batches
  }

  /**
   * Evaluate a step condition against completed step outputs.
   */
  private evaluateCondition(condition: StepCondition): boolean {
    const sourceOutput = this.completedSteps.get(condition.sourceStep)
    if (!sourceOutput) return false

    // Simple JSONPath extraction ($.key.subkey)
    const value = this.extractPath(sourceOutput, condition.path)

    switch (condition.operator) {
      case 'eq': return value === condition.value
      case 'neq': return value !== condition.value
      case 'gt': return typeof value === 'number' && value > (condition.value as number)
      case 'lt': return typeof value === 'number' && value < (condition.value as number)
      case 'contains': return typeof value === 'string' && value.includes(condition.value as string)
      case 'exists': return value !== undefined && value !== null
      case 'not_exists': return value === undefined || value === null
      default: return false
    }
  }

  /**
   * Simple JSONPath-like extraction: $.key.subkey
   */
  private extractPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.replace(/^\$\.?/, '').split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  /**
   * Substitute {{param}} placeholders in a prompt.
   */
  private substituteParams(prompt: string, params: Record<string, unknown>): string {
    return prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = params[key]
      if (value === undefined || value === null) return `[${key} not provided]`
      return String(value)
    })
  }

  /**
   * Get upstream findings (messages) relevant to a step.
   */
  private async getUpstreamFindings(stepKey: string): Promise<SwarmMessageRow[]> {
    const { data } = await this.config.supabase
      .from('swarm_messages')
      .select('*')
      .eq('run_id', this.config.runId)
      .or(`to_step_key.eq.${stepKey},to_step_key.is.null`)
      .order('created_at', { ascending: true })

    return (data || []) as SwarmMessageRow[]
  }

  /**
   * Post a message to the inter-agent message bus.
   */
  private async postMessage(
    fromStepKey: string,
    toStepKey: string | null,
    messageType: SwarmMessageType,
    content: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { data: row } = await this.config.supabase
        .from('swarm_messages')
        .insert({
          run_id: this.config.runId,
          org_id: this.config.orgId,
          from_step_key: fromStepKey,
          to_step_key: toStepKey,
          message_type: messageType,
          content,
          data: data || null,
        })
        .select()
        .single()

      if (row) {
        this.emit({ type: 'message_posted', data: { runId: this.config.runId, message: row as SwarmMessageRow } })
      }
    } catch (err) {
      logger.warn('[swarm] Failed to post message', { error: err })
    }
  }

  /**
   * Build a summary from all completed step outputs.
   */
  private buildSummary(): string {
    const parts: string[] = []
    for (const [key, output] of this.completedSteps) {
      const status = this.stepStatuses.get(key) || 'unknown'
      if (status === 'completed' && output) {
        // Try to extract summary-like fields
        const summary = (output as Record<string, unknown>).summary
          || (output as Record<string, unknown>).report
          || (output as Record<string, unknown>).pitchBrief
          || (output as Record<string, unknown>).emailBody
        if (summary) {
          parts.push(`[${key}] ${String(summary).slice(0, 200)}`)
        }
      }
    }
    return parts.length > 0
      ? parts.join('\n\n')
      : `Swarm completed with ${this.completedSteps.size} steps. Total cost: $${this.totalCost.toFixed(4)}`
  }

  // ── Database Operations ─────────────────────────────────────────────────

  private async createStepRows(steps: SwarmStepDefinition[]): Promise<void> {
    const rows = steps.map(step => ({
      run_id: this.config.runId,
      org_id: this.config.orgId,
      step_key: step.key,
      step_type: step.type,
      agent_role: step.agentRole,
      persona: step.persona || null,
      allowed_tools: step.capabilities?.allowedToolGroups || null,
      prompt: step.prompt,
      depends_on: step.dependsOn || [],
      condition: step.condition || null,
      status: 'pending' as const,
      max_retries: step.maxRetries ?? 2,
    }))

    await this.config.supabase
      .from('swarm_steps')
      .insert(rows)
  }

  private async updateStepStatus(
    stepKey: string,
    status: SwarmStepStatus,
    errorMessage?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status }
    if (status === 'executing') update.started_at = new Date().toISOString()
    if (errorMessage) update.error_message = errorMessage
    if (status === 'completed' || status === 'failed' || status === 'skipped' || status === 'blocked') {
      update.completed_at = new Date().toISOString()
    }

    await this.config.supabase
      .from('swarm_steps')
      .update(update)
      .eq('run_id', this.config.runId)
      .eq('step_key', stepKey)
  }

  private async updateRunStatus(status: SwarmRunStatus, errorMessage?: string, startedAt?: string): Promise<void> {
    const update: Record<string, unknown> = { status }
    if (status === 'executing') update.started_at = startedAt || new Date().toISOString()
    if (errorMessage) update.error_message = errorMessage

    await this.config.supabase
      .from('swarm_runs')
      .update(update)
      .eq('id', this.config.runId)
  }

  private async updateTemplateMetrics(templateId: string, success: boolean): Promise<void> {
    try {
      // Increment counters
      const { data: template } = await this.config.supabase
        .from('swarm_templates')
        .select('total_runs, success_runs, avg_duration_ms, avg_cost')
        .eq('id', templateId)
        .single()

      if (!template) return

      const newTotalRuns = (template.total_runs || 0) + 1
      const newSuccessRuns = (template.success_runs || 0) + (success ? 1 : 0)

      // Running average for duration and cost
      const prevAvgDuration = template.avg_duration_ms || 0
      const prevAvgCost = template.avg_cost || 0
      const runDuration = Date.now() - this.startTime
      const newAvgDuration = prevAvgDuration === 0
        ? runDuration
        : Math.round((prevAvgDuration * (newTotalRuns - 1) + runDuration) / newTotalRuns)
      const newAvgCost = prevAvgCost === 0
        ? this.totalCost
        : Number(((Number(prevAvgCost) * (newTotalRuns - 1) + this.totalCost) / newTotalRuns).toFixed(4))

      await this.config.supabase
        .from('swarm_templates')
        .update({
          total_runs: newTotalRuns,
          success_runs: newSuccessRuns,
          avg_duration_ms: newAvgDuration,
          avg_cost: newAvgCost,
        })
        .eq('id', templateId)
    } catch (err) {
      logger.warn('[swarm] Failed to update template metrics', { error: err })
    }
  }

  // ── Advisory Lock ─────────────────────────────────────────────────────

  private async acquireLock(): Promise<boolean> {
    try {
      const { data } = await this.config.supabase
        .from('swarm_runs')
        .select('lock_key')
        .eq('id', this.config.runId)
        .single()

      if (!data?.lock_key) return true // No lock key, proceed

      const { data: lockResult } = await this.config.supabase
        .rpc('pg_try_advisory_lock', { lock_key: data.lock_key })

      return lockResult === true
    } catch {
      // If advisory lock RPC doesn't exist, proceed without lock
      return true
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      const { data } = await this.config.supabase
        .from('swarm_runs')
        .select('lock_key')
        .eq('id', this.config.runId)
        .single()

      if (data?.lock_key) {
        await this.config.supabase
          .rpc('pg_advisory_unlock', { lock_key: data.lock_key })
      }
    } catch {
      // Best effort
    }
  }

  // ── Event Emitter ─────────────────────────────────────────────────────

  private emit(event: SwarmEvent): void {
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event)
      } catch {
        // Never let event emission break execution
      }
    }
  }
}

// ── Rollback Engine ─────────────────────────────────────────────────────────

export async function rollbackSwarm(
  supabase: SupabaseClient,
  runId: string,
  orgId: string,
): Promise<{ success: boolean; rolledBack: number; errors: string[] }> {
  const errors: string[] = []
  let rolledBack = 0

  // Load the run and its reversible actions
  const { data: run } = await supabase
    .from('swarm_runs')
    .select('*')
    .eq('id', runId)
    .eq('org_id', orgId)
    .single()

  if (!run) {
    return { success: false, rolledBack: 0, errors: ['Swarm run not found'] }
  }

  const actions = (run.rollback_log as ReversibleAction[]) || []

  if (actions.length === 0) {
    return { success: true, rolledBack: 0, errors: ['No reversible actions to roll back'] }
  }

  // Whitelist of allowed tables for rollback operations
  const ALLOWED_TABLES = new Set(['tasks', 'invoices', 'swarm_runs', 'swarm_steps'])

  // Execute rollbacks in reverse order
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i]
    try {
      switch (action.undoStrategy) {
        case 'delete': {
          const table = action.undoPayload?.table
          const id = action.undoPayload?.id
          if (!table || !id || typeof table !== 'string' || typeof id !== 'string') {
            errors.push(`Invalid undo payload for delete action: ${action.actionType}`)
            break
          }
          if (!ALLOWED_TABLES.has(table)) {
            errors.push(`Unauthorized table for rollback: ${table}`)
            break
          }
          await supabase
            .from(table)
            .delete()
            .eq('id', id)
            .eq('org_id', orgId)
          break
        }

        case 'update': {
          const table = action.undoPayload?.table
          const id = action.undoPayload?.id
          const data = action.undoPayload?.data
          if (!table || !id || !data || typeof table !== 'string' || typeof id !== 'string') {
            errors.push(`Invalid undo payload for update action: ${action.actionType}`)
            break
          }
          if (!ALLOWED_TABLES.has(table)) {
            errors.push(`Unauthorized table for rollback: ${table}`)
            break
          }
          await supabase
            .from(table)
            .update(data as Record<string, unknown>)
            .eq('id', id)
            .eq('org_id', orgId)
          break
        }

        case 'archive': {
          const table = action.undoPayload?.table
          const id = action.undoPayload?.id
          if (!table || !id || typeof table !== 'string' || typeof id !== 'string') {
            errors.push(`Invalid undo payload for archive action: ${action.actionType}`)
            break
          }
          if (!ALLOWED_TABLES.has(table)) {
            errors.push(`Unauthorized table for rollback: ${table}`)
            break
          }
          await supabase
            .from(table)
            .update({ status: 'archived' })
            .eq('id', id)
            .eq('org_id', orgId)
          break
        }

        case 'manual':
          errors.push(`Manual rollback required for: ${action.actionType} in step ${action.stepKey}`)
          continue
      }

      rolledBack++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to rollback ${action.actionType}: ${errorMsg}`)
    }
  }

  // Mark all steps as rolled back
  await supabase
    .from('swarm_steps')
    .update({ status: 'rolled_back' })
    .eq('run_id', runId)
    .in('status', ['completed', 'failed', 'partial'])

  // Mark run as rolled back
  await supabase
    .from('swarm_runs')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
    })
    .eq('id', runId)

  return {
    success: errors.length === 0,
    rolledBack,
    errors,
  }
}
