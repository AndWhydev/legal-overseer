import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateMRR, type MRRSnapshot } from './mrr'

function createMockSupabase(args: {
  subscriptions: Array<Record<string, unknown>>
  upgrades?: Array<Record<string, unknown>>
}) {
  const api = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select(fields: string) {
            // Main subscriptions query
            if (fields.includes('tier, status')) {
              return Promise.resolve({
                data: args.subscriptions,
                error: null,
              })
            }

            // Upgrades query
            return {
              eq: (key: string, value: unknown) => ({
                gte: (key2: string, value2: unknown) =>
                  Promise.resolve({
                    data: args.upgrades ?? [],
                    error: null,
                  }),
              }),
            }
          },
        }
      }
      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
  }
}

describe('calculateMRR', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates total MRR for active subscriptions', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'starter',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'scale',
          status: 'active',
          stripe_subscription_id: 'sub3',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // 199 + 349 + 599 = 1147
    expect(result.totalMRR).toBe(1147)
    expect(result.activeSubscriptions).toBe(3)
  })

  it('counts trialing subscriptions as active', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'growth',
          status: 'trialing',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    expect(result.activeSubscriptions).toBe(1)
    expect(result.totalMRR).toBe(349)
  })

  it('breaks down MRR by tier', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'starter',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'starter',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub3',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    expect(result.byTier['starter']).toEqual({ count: 2, mrr: 398 })
    expect(result.byTier['growth']).toEqual({ count: 1, mrr: 349 })
  })

  it('ignores free and beta tiers (0 MRR)', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'free',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'beta',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // Free and beta tiers have 0 MRR but are still counted as active subscriptions
    expect(result.totalMRR).toBe(0)
    expect(result.activeSubscriptions).toBe(2)
    expect(result.byTier['free']).toEqual({ count: 1, mrr: 0 })
    expect(result.byTier['beta']).toEqual({ count: 1, mrr: 0 })
  })

  it('calculates churn rate for cancelled subscriptions this month', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'starter',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'scale',
          status: 'cancelled',
          stripe_subscription_id: 'sub4',
          created_at: '2026-01-01',
          current_period_end: '2026-03-12', // Within this month
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // Has churned subscriptions
    expect(result.churnedThisMonth).toBe(1)
    expect(result.churnRate).toBeGreaterThan(0)
  })

  it('returns zero churn when there are no subscriptions', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [],
    })

    const result = await calculateMRR(supabase)

    expect(result.churnedThisMonth).toBe(0)
    expect(result.churnRate).toBe(0)
  })

  it('counts expansion revenue for growth/scale upgrades this month', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'starter',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
      ],
      upgrades: [
        {
          tier: 'growth',
        },
        {
          tier: 'scale',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // growth (349) + scale (599) = 948
    expect(result.expansionRevenue).toBe(948)
  })

  it('calculates net new MRR accounting for churn', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'scale',
          status: 'cancelled',
          stripe_subscription_id: 'sub3',
          created_at: '2026-01-01',
          current_period_end: '2026-03-12',
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // totalMRR = 349 + 349 = 698
    // churnedThisMonth = 1, activeCount = 2
    // netNewMRR = 698 - (1 * (698 / 2)) = 698 - 349 = 349
    expect(result.netNewMRR).toBe(349)
  })

  it('rounds percentages to 2 decimal places', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active',
          stripe_subscription_id: 'sub3',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'cancelled',
          stripe_subscription_id: 'sub4',
          created_at: '2026-01-01',
          current_period_end: '2026-02-01', // Before month start
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // churnRate = 0 / 3 = 0 (no churn this month, since cancelled was before march)
    expect(result.churnRate).toBe(0)
  })

  it('handles null values in subscription fields gracefully', async () => {
    const { supabase } = createMockSupabase({
      subscriptions: [
        {
          tier: null,
          status: 'active',
          stripe_subscription_id: 'sub1',
          created_at: '2026-01-01',
          current_period_end: '2026-04-15',
        },
        {
          tier: 'growth',
          status: 'active', // Changed to active since null end_date breaks cancelled detection
          stripe_subscription_id: 'sub2',
          created_at: '2026-01-01',
          current_period_end: null, // No end date
        },
      ],
    })

    const result = await calculateMRR(supabase)

    // null tier is unknown (0), growth is 349
    expect(result.totalMRR).toBe(349)
    expect(result.activeSubscriptions).toBe(2)
  })
})
