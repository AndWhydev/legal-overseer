import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MRRSnapshot {
  totalMRR: number
  activeSubscriptions: number
  churnedThisMonth: number
  churnRate: number
  expansionRevenue: number
  netNewMRR: number
  byTier: Record<string, { count: number; mrr: number }>
}

const TIER_MRR: Record<string, number> = {
  starter: 199,
  growth: 349,
  scale: 599,
  beta: 0,
  free: 0,
  enterprise: 0, // custom — tracked in subscription record
}

// ---------------------------------------------------------------------------
// MRR calculation
// ---------------------------------------------------------------------------

export async function calculateMRR(
  client: SupabaseClient,
): Promise<MRRSnapshot> {
  // Fetch all subscriptions
  const { data: subs } = await client
    .from('subscriptions')
    .select('tier, status, stripe_subscription_id, created_at, current_period_end')

  const subscriptions = subs ?? []

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const byTier: Record<string, { count: number; mrr: number }> = {}
  let totalMRR = 0
  let activeCount = 0
  let churnedThisMonth = 0
  let expansionRevenue = 0

  for (const sub of subscriptions) {
    const tier = (sub.tier as string) ?? 'unknown'
    const status = sub.status as string
    const tierMRR = TIER_MRR[tier] ?? 0

    if (!byTier[tier]) {
      byTier[tier] = { count: 0, mrr: 0 }
    }

    if (status === 'active' || status === 'trialing') {
      byTier[tier].count += 1
      byTier[tier].mrr += tierMRR
      totalMRR += tierMRR
      activeCount += 1
    } else if (status === 'cancelled') {
      const endDate = sub.current_period_end
        ? new Date(sub.current_period_end as string)
        : null
      if (endDate && endDate >= monthStart) {
        churnedThisMonth += 1
      }
    }
  }

  // Churn rate = churned / (active + churned) for this month
  const totalBase = activeCount + churnedThisMonth
  const churnRate = totalBase > 0 ? churnedThisMonth / totalBase : 0

  // Expansion revenue: subscriptions upgraded this month
  // (simplified — would need historical tier tracking for full accuracy)
  const { data: upgrades } = await client
    .from('subscriptions')
    .select('tier')
    .eq('status', 'active')
    .gte('created_at', monthStart.toISOString())

  if (upgrades) {
    for (const u of upgrades) {
      const tier = u.tier as string
      if (tier === 'growth' || tier === 'scale') {
        expansionRevenue += TIER_MRR[tier] ?? 0
      }
    }
  }

  const netNewMRR = totalMRR - (churnedThisMonth * (totalMRR / Math.max(activeCount, 1)))

  return {
    totalMRR,
    activeSubscriptions: activeCount,
    churnedThisMonth,
    churnRate: Math.round(churnRate * 10000) / 100, // percentage with 2 decimals
    expansionRevenue,
    netNewMRR: Math.round(netNewMRR),
    byTier,
  }
}
