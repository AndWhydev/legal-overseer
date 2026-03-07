import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cost per million tokens by model tier (USD).
 * Must match run-logger.ts MODEL_COSTS.
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
}

/**
 * Usage metrics for an organization in a billing period.
 */
export interface UsageMetrics {
  orgId: string
  period: string
  totalTokens: number
  totalAgentRuns: number
  totalStorageMB: number
  estimatedCostUSD: number
}

/**
 * Track usage for an organization.
 * Never throws — logging should not break agent execution.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  orgId: string,
  type: 'token_usage' | 'agent_run' | 'storage_mb',
  amount: number,
): Promise<void> {
  try {
    await supabase.from('usage_events').insert({
      org_id: orgId,
      event_type: type,
      metadata: { amount },
    })
  } catch (err) {
    logger.warn('[usage-metering] Failed to track usage:', type, amount, err)
  }
}

/**
 * Get usage metrics for an organization in a billing period.
 * Returns zero metrics on error.
 */
export async function getUsage(
  supabase: SupabaseClient,
  orgId: string,
  period: 'current_month' | 'current_billing_period' = 'current_month',
): Promise<UsageMetrics> {
  try {
    // Determine date range
    let startDate: Date
    const endDate = new Date()

    if (period === 'current_month') {
      // First of current month to now
      const now = new Date()
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      // For current_billing_period, query subscription to get current_period_start
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('current_period_start')
        .eq('org_id', orgId)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sub?.current_period_start) {
        startDate = new Date(sub.current_period_start as string)
      } else {
        // Fallback to current month if no active subscription
        const now = new Date()
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      }
    }

    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()

    // Query all usage events for this org in the period
    const { data: events, error } = await supabase
      .from('usage_events')
      .select('*')
      .eq('org_id', orgId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)

    if (error) {
      logger.warn('[usage-metering] Failed to fetch usage events:', error.message)
      return {
        orgId,
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalTokens: 0,
        totalAgentRuns: 0,
        totalStorageMB: 0,
        estimatedCostUSD: 0,
      }
    }

    // Aggregate usage
    let totalTokens = 0
    let totalAgentRuns = 0
    let totalStorageMB = 0

    for (const event of events ?? []) {
      const metadata = event.metadata as Record<string, unknown> | null
      const amount = (metadata?.amount as number) ?? 0

      if (event.event_type === 'token_usage') {
        totalTokens += amount
      } else if (event.event_type === 'agent_run') {
        totalAgentRuns += amount
      } else if (event.event_type === 'storage_mb') {
        totalStorageMB += amount
      }
    }

    // Estimate cost based on token usage
    // For simplicity, assume average model cost (sonnet)
    const estimatedCostUSD = parseFloat(
      ((totalTokens * (3 + 15)) / 1_000_000).toFixed(2),
    )

    return {
      orgId,
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      totalTokens,
      totalAgentRuns,
      totalStorageMB,
      estimatedCostUSD,
    }
  } catch (err) {
    logger.warn('[usage-metering] Unexpected error fetching usage:', err)
    return {
      orgId,
      period: 'unknown',
      totalTokens: 0,
      totalAgentRuns: 0,
      totalStorageMB: 0,
      estimatedCostUSD: 0,
    }
  }
}
