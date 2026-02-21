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
 * Log an agent run to the agent_runs table.
 * Never throws -- logging should not break agent execution.
 */
export async function logAgentRun(
  supabase: SupabaseClient,
  run: Omit<AgentRun, 'id' | 'created_at'>,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({
        ...run,
        cost_estimate: estimateRunCost(run.tokens_in, run.tokens_out, run.model_used),
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
