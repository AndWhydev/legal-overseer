import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleConfig, RoleState } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleCostCheck {
  allowed: boolean
  reason?: string
  spentToday: number
  dailyBudget: number
  remainingBudget: number
}

// ---------------------------------------------------------------------------
// Per-Role Cost Guard
// ---------------------------------------------------------------------------

/**
 * Check if a role can proceed based on its daily budget.
 *
 * Queries agent_runs for today's cost for this role_config_id.
 * Uses the role_config's daily_budget_cents (in cents) as the limit.
 *
 * This is more granular than the org-level canProceed() -- it prevents
 * a single runaway role from consuming the entire org budget.
 */
export async function canRoleProceed(
  supabase: SupabaseClient,
  roleConfigId: string,
  dailyBudgetCents: number,
): Promise<RoleCostCheck> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  let spentTodayCents = 0

  try {
    // Query agent_runs where agent_config_id matches role_config_id
    // (roles re-use the agent_runs table with role_config_id as agent_config_id)
    const { data: runs } = await supabase
      .from('agent_runs')
      .select('cost_estimate')
      .eq('agent_config_id', roleConfigId)
      .gte('created_at', todayStart.toISOString())

    if (runs) {
      // cost_estimate is in USD, convert to cents for comparison
      const spentUsd = runs.reduce(
        (sum: number, r: { cost_estimate: number | null }) =>
          sum + (r.cost_estimate ?? 0),
        0,
      )
      spentTodayCents = Math.round(spentUsd * 100)
    }
  } catch {
    // Fail-open: if we can't read costs, allow proceeding
    logger.warn(`[role-cost-guard] Failed to read cost for role ${roleConfigId}, allowing`)
  }

  const remainingBudget = Math.max(0, dailyBudgetCents - spentTodayCents)
  const allowed = spentTodayCents < dailyBudgetCents

  return {
    allowed,
    spentToday: spentTodayCents,
    dailyBudget: dailyBudgetCents,
    remainingBudget,
    reason: allowed
      ? undefined
      : `Role daily budget ${dailyBudgetCents}c reached (spent ${spentTodayCents}c today)`,
  }
}

// ---------------------------------------------------------------------------
// Haiku Pre-Screen
// ---------------------------------------------------------------------------

/**
 * Haiku pre-screen: cheap check before expensive evaluation.
 *
 * Returns true if there's new data since last tick that warrants
 * a full (Sonnet/Opus) evaluation. This saves cost by avoiding
 * unnecessary LLM calls when nothing has changed.
 *
 * Checks vary by role type:
 * - Finance: new invoices, payments, or overdue items since last tick
 * - Comms: new messages received since last tick
 * - Sales: new leads or proposal responses since last tick
 */
export async function shouldEvaluate(
  supabase: SupabaseClient,
  roleConfig: RoleConfig,
  roleState: RoleState,
): Promise<{ shouldRun: boolean; reason: string }> {
  const lastTick = roleState.last_tick_at
  const tag = `[pre-screen:${roleConfig.role_type}:${roleConfig.org_id.slice(0, 8)}]`

  // If never ticked, always evaluate
  if (!lastTick) {
    return { shouldRun: true, reason: 'First tick for this role' }
  }

  try {
    switch (roleConfig.role_type) {
      case 'finance':
        return await checkFinanceChanges(supabase, roleConfig.org_id, lastTick, tag)

      case 'comms':
        return await checkCommsChanges(supabase, roleConfig.org_id, lastTick, tag)

      case 'sales':
        return await checkSalesChanges(supabase, roleConfig.org_id, lastTick, tag)

      default:
        // Unknown role type -- always evaluate to be safe
        return { shouldRun: true, reason: `Unknown role type: ${roleConfig.role_type}` }
    }
  } catch (err) {
    // Pre-screen failure should not block evaluation
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`${tag} Pre-screen failed, proceeding with evaluation: ${message}`)
    return { shouldRun: true, reason: `Pre-screen error: ${message}` }
  }
}

// ---------------------------------------------------------------------------
// Role-Specific Change Checks
// ---------------------------------------------------------------------------

async function checkFinanceChanges(
  supabase: SupabaseClient,
  orgId: string,
  since: string,
  tag: string,
): Promise<{ shouldRun: boolean; reason: string }> {
  // Check for new/updated invoices
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('updated_at', since)

  if (invoiceCount && invoiceCount > 0) {
    logger.info(`${tag} Found ${invoiceCount} updated invoices since last tick`)
    return { shouldRun: true, reason: `${invoiceCount} invoice(s) updated since last tick` }
  }

  // Check for overdue invoices (status check, not time-based)
  const { count: overdueCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'overdue')

  if (overdueCount && overdueCount > 0) {
    return { shouldRun: true, reason: `${overdueCount} overdue invoice(s) need attention` }
  }

  return { shouldRun: false, reason: 'No finance changes since last tick' }
}

async function checkCommsChanges(
  supabase: SupabaseClient,
  orgId: string,
  since: string,
  tag: string,
): Promise<{ shouldRun: boolean; reason: string }> {
  // Check for new inbound messages
  const { count: messageCount } = await supabase
    .from('inbox_items')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)

  if (messageCount && messageCount > 0) {
    logger.info(`${tag} Found ${messageCount} new messages since last tick`)
    return { shouldRun: true, reason: `${messageCount} new message(s) since last tick` }
  }

  return { shouldRun: false, reason: 'No new messages since last tick' }
}

async function checkSalesChanges(
  supabase: SupabaseClient,
  orgId: string,
  since: string,
  tag: string,
): Promise<{ shouldRun: boolean; reason: string }> {
  // Check for new leads
  const { count: leadCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)

  if (leadCount && leadCount > 0) {
    logger.info(`${tag} Found ${leadCount} new leads since last tick`)
    return { shouldRun: true, reason: `${leadCount} new lead(s) since last tick` }
  }

  // Check for updated proposals
  const { count: proposalCount } = await supabase
    .from('proposals')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('updated_at', since)

  if (proposalCount && proposalCount > 0) {
    logger.info(`${tag} Found ${proposalCount} updated proposals since last tick`)
    return { shouldRun: true, reason: `${proposalCount} proposal(s) updated since last tick` }
  }

  return { shouldRun: false, reason: 'No sales changes since last tick' }
}
