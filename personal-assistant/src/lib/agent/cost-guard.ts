import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-org daily cost guard.
 *
 * Reads `org_settings.daily_cost_limit` and compares against
 * the sum of `agent_runs.cost_estimate` for today (UTC).
 * Agents call `canProceed()` before making LLM invocations.
 */

export interface CostGuardResult {
  allowed: boolean
  dailyLimit: number
  spentToday: number
  remainingBudget: number
  reason?: string
}

const DEFAULT_DAILY_LIMIT = 10.0 // USD fallback if org_settings row missing

/**
 * Check whether an org has remaining daily budget for agent runs.
 */
export async function canProceed(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CostGuardResult> {
  // 1. Get org daily limit
  let dailyLimit = DEFAULT_DAILY_LIMIT

  try {
    const { data: settings } = await supabase
      .from('org_settings')
      .select('daily_cost_limit')
      .eq('org_id', orgId)
      .single()

    if (settings?.daily_cost_limit != null && settings.daily_cost_limit > 0) {
      dailyLimit = settings.daily_cost_limit
    }
  } catch {
    // Table may not exist yet; use default
  }

  // 2. Sum today's cost_estimate from agent_runs
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  let spentToday = 0

  try {
    const { data: runs } = await supabase
      .from('agent_runs')
      .select('cost_estimate')
      .eq('org_id', orgId)
      .gte('created_at', todayStart.toISOString())

    if (runs) {
      spentToday = runs.reduce(
        (sum: number, r: { cost_estimate: number | null }) =>
          sum + (r.cost_estimate ?? 0),
        0,
      )
    }
  } catch {
    // If query fails, allow proceeding (fail-open for cost reads)
  }

  const remainingBudget = Math.max(0, dailyLimit - spentToday)
  const allowed = spentToday < dailyLimit

  return {
    allowed,
    dailyLimit,
    spentToday,
    remainingBudget,
    reason: allowed ? undefined : `Daily cost limit $${dailyLimit} reached (spent $${spentToday.toFixed(4)})`,
  }
}
