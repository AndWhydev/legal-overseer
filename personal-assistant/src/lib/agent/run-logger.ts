import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRun, ModelTier } from '@/lib/bitbit-core'

/**
 * Cost per million tokens by model tier (USD).
 */
const MODEL_COSTS: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
}

/**
 * Estimate USD cost for a run based on token counts and model tier.
 */
export function estimateRunCost(
  tokensIn: number,
  tokensOut: number,
  model: ModelTier,
): number {
  const costs = MODEL_COSTS[model]
  if (!costs) return 0
  return (tokensIn * costs.input + tokensOut * costs.output) / 1_000_000
}

/**
 * Lightweight run log payload for engine integration.
 * Maps to the agent_runs DB table but is more flexible than the full AgentRun type.
 */
export interface RunLogPayload {
  org_id: string
  agent_config_id: string
  trigger_type: string
  trigger_payload?: Record<string, unknown>
  status: string
  result_summary?: string
  tokens_in: number
  tokens_out: number
  cost_estimate: number
  duration_ms: number
  tool_calls: number
  iterations: number
  error_message?: string
  model_used?: ModelTier
}

/**
 * Log an agent run to the agent_runs table.
 * Never throws — logging should not break agent execution.
 */
export async function logAgentRun(
  supabase: SupabaseClient,
  run: RunLogPayload,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({
        org_id: run.org_id,
        agent_config_id: run.agent_config_id,
        trigger_type: run.trigger_type,
        trigger_payload: run.trigger_payload ?? {},
        status: run.status,
        result_summary: run.result_summary ?? null,
        tokens_in: run.tokens_in,
        tokens_out: run.tokens_out,
        cost_estimate: run.cost_estimate,
        duration_ms: run.duration_ms,
        tool_calls: run.tool_calls,
        iterations: run.iterations,
        error_message: run.error_message ?? null,
        model_used: run.model_used ?? 'sonnet',
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[run-logger] Failed to log agent run:', error.message)
      return null
    }

    return { id: data.id }
  } catch (err) {
    console.warn('[run-logger] Unexpected error logging agent run:', err)
    return null
  }
}

/**
 * Fetch recent agent runs for an org, ordered by created_at DESC.
 */
export async function getRecentRuns(
  supabase: SupabaseClient,
  orgId: string,
  limit: number = 20,
): Promise<AgentRun[]> {
  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('[run-logger] Failed to fetch recent runs:', error.message)
      return []
    }

    return (data ?? []) as AgentRun[]
  } catch (err) {
    console.warn('[run-logger] Unexpected error fetching runs:', err)
    return []
  }
}
