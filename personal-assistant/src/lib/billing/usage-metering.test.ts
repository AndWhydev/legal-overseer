import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackUsage, getUsage, type UsageMetrics } from './usage-metering'

function createMockSupabase(args: {
  usageEvents: Array<Record<string, unknown>>
  subscriptions?: Array<Record<string, unknown>>
  insertSuccess?: boolean
}) {
  const api = {
    from(table: string) {
      if (table === 'usage_events') {
        return {
          insert: () => Promise.resolve({ error: args.insertSuccess === false ? { message: 'Insert failed' } : null }),
          select: () => ({
            eq: (key: string, value: unknown) => ({
              gte: (key: string, value: unknown) => ({
                lte: (key: string, value: unknown) =>
                  Promise.resolve({
                    data: args.usageEvents,
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) => ({
              in: (key: string, value: unknown) => ({
                order: (key: string, opts: unknown) => ({
                  limit: (count: number) => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: (args.subscriptions?.[0] ?? null),
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
  }
}

describe('trackUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks token usage without throwing', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      insertSuccess: true,
    })

    await expect(trackUsage(supabase, 'org-1', 'token_usage', 1000)).resolves.toBeUndefined()
  })

  it('tracks agent run without throwing', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      insertSuccess: true,
    })

    await expect(trackUsage(supabase, 'org-1', 'agent_run', 1)).resolves.toBeUndefined()
  })

  it('tracks storage usage without throwing', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      insertSuccess: true,
    })

    await expect(trackUsage(supabase, 'org-1', 'storage_mb', 50)).resolves.toBeUndefined()
  })

  it('handles insert errors gracefully', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      insertSuccess: false,
    })

    // Should not throw even on error
    await expect(trackUsage(supabase, 'org-1', 'token_usage', 1000)).resolves.toBeUndefined()
  })
})

describe('getUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns zero metrics when no events exist', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalTokens).toBe(0)
    expect(result.totalAgentRuns).toBe(0)
    expect(result.totalStorageMB).toBe(0)
    expect(result.estimatedCostUSD).toBe(0)
  })

  it('aggregates token usage events', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 100000 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'token_usage', metadata: { amount: 200000 }, created_at: '2026-03-11T10:00:00Z' },
        { event_type: 'token_usage', metadata: { amount: 150000 }, created_at: '2026-03-12T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalTokens).toBe(450000)
  })

  it('aggregates agent run events', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'agent_run', metadata: { amount: 1 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'agent_run', metadata: { amount: 1 }, created_at: '2026-03-11T10:00:00Z' },
        { event_type: 'agent_run', metadata: { amount: 1 }, created_at: '2026-03-12T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalAgentRuns).toBe(3)
  })

  it('aggregates storage usage events', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'storage_mb', metadata: { amount: 100 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'storage_mb', metadata: { amount: 50 }, created_at: '2026-03-11T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalStorageMB).toBe(150)
  })

  it('calculates estimated cost from tokens', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 2000000 }, created_at: '2026-03-10T10:00:00Z' }, // 2M tokens
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    // 2M tokens * (3 + 15) / 1M = 36 USD
    expect(result.estimatedCostUSD).toBe(36)
  })

  it('handles current_month period', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 100000 }, created_at: '2026-03-10T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    // current_month uses first of month (or last day of previous month for ISO)
    // Just check format is YYYY-MM-DD to YYYY-MM-DD
    expect(result.period).toMatch(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/)
  })

  it('handles current_billing_period', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 100000 }, created_at: '2026-02-15T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-02-10T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_billing_period')

    expect(result.period).toMatch(/2026-02-10 to 2026-03-15/)
  })

  it('handles null metadata gracefully', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: null, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'token_usage', metadata: { amount: 100000 }, created_at: '2026-03-11T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalTokens).toBe(100000)
  })

  it('handles mixed event types', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 100000 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'agent_run', metadata: { amount: 2 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'storage_mb', metadata: { amount: 50 }, created_at: '2026-03-10T10:00:00Z' },
        { event_type: 'token_usage', metadata: { amount: 200000 }, created_at: '2026-03-11T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    expect(result.totalTokens).toBe(300000)
    expect(result.totalAgentRuns).toBe(2)
    expect(result.totalStorageMB).toBe(50)
  })

  it('returns zero metrics on database error', async () => {
    const failingSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: null,
                      error: { message: 'Database error' },
                    }),
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const result = await getUsage(
      failingSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
      'org-1',
    )

    expect(result.totalTokens).toBe(0)
    expect(result.totalAgentRuns).toBe(0)
  })

  it('includes orgId in response', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-test-123', 'current_month')

    expect(result.orgId).toBe('org-test-123')
  })

  it('rounds cost to 2 decimal places', async () => {
    const { supabase } = createMockSupabase({
      usageEvents: [
        { event_type: 'token_usage', metadata: { amount: 123456 }, created_at: '2026-03-10T10:00:00Z' },
      ],
      subscriptions: [{ current_period_start: '2026-03-01T00:00:00Z' }],
    })

    const result = await getUsage(supabase, 'org-1', 'current_month')

    // Check that cost has at most 2 decimal places
    const costStr = result.estimatedCostUSD.toString()
    const decimalPart = costStr.split('.')[1] ?? ''
    expect(decimalPart.length).toBeLessThanOrEqual(2)
  })
})
