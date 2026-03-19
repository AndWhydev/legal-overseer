import type { SupabaseClient } from '@supabase/supabase-js'
import { getRoleUsageToday } from '@/lib/billing/usage-metering'

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

// ---------------------------------------------------------------------------
// Per-role token budget enforcement
// ---------------------------------------------------------------------------

export interface RoleBudgetConfig {
  maxTokensPerExecution: number
  dailyTokenBudget: number
  warningThresholdPct: number
}

/**
 * Per-role budget configuration for growth workloads.
 * Roles not in this map are unbounded (core agent tools).
 */
export const ROLE_BUDGET_CONFIG: Record<string, RoleBudgetConfig> = {
  ads: { maxTokensPerExecution: 50_000, dailyTokenBudget: 500_000, warningThresholdPct: 0.8 },
  seo: { maxTokensPerExecution: 30_000, dailyTokenBudget: 300_000, warningThresholdPct: 0.8 },
  content: { maxTokensPerExecution: 80_000, dailyTokenBudget: 800_000, warningThresholdPct: 0.8 },
  tenders: { maxTokensPerExecution: 60_000, dailyTokenBudget: 600_000, warningThresholdPct: 0.8 },
}

export interface RoleBudgetResult {
  allowed: boolean
  warning: boolean
  dailyUsed: number
  dailyLimit: number
  remainingTokens: number
  reason?: string
}

/**
 * Check per-role daily token budget.
 * Returns unbounded result for unknown roles (non-growth tools).
 */
export async function checkRoleBudget(
  supabase: SupabaseClient,
  orgId: string,
  role: string,
): Promise<RoleBudgetResult> {
  const config = ROLE_BUDGET_CONFIG[role]
  if (!config) {
    return {
      allowed: true,
      warning: false,
      dailyUsed: 0,
      dailyLimit: Infinity,
      remainingTokens: Infinity,
    }
  }

  const dailyUsed = await getRoleUsageToday(supabase, orgId, role)
  const { dailyTokenBudget, warningThresholdPct } = config
  const remainingTokens = Math.max(0, dailyTokenBudget - dailyUsed)

  if (dailyUsed >= dailyTokenBudget) {
    return {
      allowed: false,
      warning: false,
      dailyUsed,
      dailyLimit: dailyTokenBudget,
      remainingTokens: 0,
      reason: `Daily token budget for ${role} exhausted (${dailyUsed}/${dailyTokenBudget})`,
    }
  }

  const warning = dailyUsed >= dailyTokenBudget * warningThresholdPct

  return {
    allowed: true,
    warning,
    dailyUsed,
    dailyLimit: dailyTokenBudget,
    remainingTokens,
  }
}

/**
 * Get the per-execution token cap for a role.
 * Returns undefined for non-growth roles (unbounded).
 */
export function getExecutionTokenCap(role: string): number | undefined {
  return ROLE_BUDGET_CONFIG[role]?.maxTokensPerExecution
}
