/**
 * Swarm Orchestration Module
 *
 * Multi-agent coordination system for BitBit.
 * Enables complex operations through coordinated agent teams.
 */

export { SwarmCoordinator } from './coordinator'
export { SwarmExecutor, rollbackSwarm } from './executor'
export { SwarmAgent } from './agent'
export { BUILTIN_TEMPLATES, matchTemplate } from './templates'
export type {
  // Core types
  AgentRole,
  AgentPersona,
  CapabilityBoundary,
  StepType,
  StepCondition,
  SwarmStepDefinition,
  SwarmGovernance,
  SwarmDefinition,

  // DB row types
  SwarmRunStatus,
  SwarmStepStatus,
  SwarmMessageType,
  SwarmTemplateRow,
  SwarmRunRow,
  SwarmStepRow,
  SwarmMessageRow,

  // Execution types
  ReversibleAction,
  NegotiationResult,
  SwarmStepResult,
  SwarmParticipant,
  SwarmStepContext,

  // Coordinator types
  CoordinatorClassification,
  SwarmExecutionPlan,

  // Events
  SwarmEvent,
} from './types'

import type { SupabaseClient } from '@supabase/supabase-js'

/** Convenience: trigger a swarm from natural language or template slug */
export async function triggerSwarm(
  supabase: SupabaseClient,
  orgId: string,
  input: string | { query?: string; templateSlug?: string; params?: Record<string, unknown> },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _opts?: any
) {
  const coordinator = new SwarmCoordinator(supabase, orgId)
  if (typeof input === 'string') {
    return coordinator.classify(input)
  }
  if (input.templateSlug) {
    return coordinator.triggerByTemplate(input.templateSlug, input.params || {})
  }
  return coordinator.classify(input.query || '')
}

/** Cancel a running swarm */
export async function cancelSwarmRun(supabase: SupabaseClient, runId: string) {
  const { error } = await supabase
    .from('swarm_runs')
    .update({ status: 'cancelled' })
    .eq('id', runId)
  return !error
}

/** Register built-in participants (no-op — participants are resolved at runtime from role registry) */
export function registerBuiltinParticipants() {
  // Participants are resolved dynamically by SwarmAgent from the role registry
  // This function exists for API compatibility
}

/** Create a swarm run from a template */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createSwarmRun(supabase: SupabaseClient, opts: any) {
  const { data, error } = await supabase.from('swarm_runs').insert({
    org_id: opts.orgId,
    name: opts.name,
    dag: opts.dag,
    input_params: opts.inputParams || {},
    template_id: opts.templateId || null,
    triggered_by: opts.triggeredBy || 'api',
    status: 'pending',
  }).select().single()
  if (error) throw error
  return data
}

/** Execute a swarm run by ID */
export async function executeSwarmRun(supabase: SupabaseClient, runId: string) {
  const { data: run } = await supabase.from('swarm_runs').select('org_id').eq('id', runId).single()
  if (!run) throw new Error(`Swarm run not found: ${runId}`)
  const executor = new SwarmExecutor(supabase, run.org_id, runId)
  return executor.execute()
}
