import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock email transport before imports
vi.mock('@/lib/email/email-transport', () => ({
  sendCommandReplyEmail: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/core/app-url', () => ({
  getAppUrl: () => 'https://app.bitbit.chat',
}))

// ---------------------------------------------------------------------------
// Mock Supabase client factory for dunning tests
// ---------------------------------------------------------------------------

interface MockDunningState {
  subscriptions?: Array<Record<string, unknown>>
  organization?: Record<string, unknown> | null
}

function createMockSupabase(state: MockDunningState = {}) {
  const calls: Array<{ table: string; operation: string; args: unknown }> = []

  const mockResult = (data: unknown) => Promise.resolve({ data, error: null })

  const makeChain = (table: string, baseData?: unknown) => {
    const currentData = baseData

    const chain: Record<string, unknown> = {
      select(columns?: string) {
        return {
          eq(key: string, value: unknown) {
            return {
              order(col: string, opts?: Record<string, unknown>) {
                return {
                  limit(n: number) {
                    return {
                      maybeSingle() {
                        calls.push({ table, operation: 'select.eq.order.limit.maybeSingle', args: { key, value } })
                        if (table === 'subscriptions') {
                          const subs = state.subscriptions ?? []
                          return mockResult(subs[0] ?? null)
                        }
                        return mockResult(null)
                      },
                    }
                  },
                }
              },
              maybeSingle() {
                calls.push({ table, operation: 'select.eq.maybeSingle', args: { key, value } })
                if (table === 'subscriptions') {
                  const subs = state.subscriptions ?? []
                  return mockResult(subs[0] ?? null)
                }
                return mockResult(null)
              },
              single() {
                calls.push({ table, operation: 'select.eq.single', args: { key, value } })
                if (table === 'organizations') {
                  return mockResult(state.organization ?? null)
                }
                return mockResult(null)
              },
            }
          },
          in(key: string, values: unknown[]) {
            // For chained queries like .eq().in()
            return {
              eq(key2: string, value2: unknown) {
                return {
                  order(col: string, opts?: Record<string, unknown>) {
                    return {
                      limit(n: number) {
                        return {
                          maybeSingle() {
                            calls.push({ table, operation: 'select.in.eq.order.limit.maybeSingle', args: { key, values, key2, value2 } })
                            return mockResult(null)
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
      update(data: unknown) {
        return {
          eq(key: string, value: unknown) {
            calls.push({ table, operation: 'update.eq', args: { data, key, value } })
            return mockResult(null)
          },
        }
      },
      insert(data: unknown) {
        calls.push({ table, operation: 'insert', args: data })
        return mockResult(null)
      },
      upsert(data: unknown) {
        calls.push({ table, operation: 'upsert', args: data })
        return mockResult(null)
      },
    }

    return chain
  }

  // For processDunningSequence, we need .select().eq('status', 'past_due') to return all subscriptions
  const api = {
    from(table: string) {
      return {
        select(columns?: string) {
          return {
            eq(key: string, value: unknown) {
              // For status=past_due query that returns an array
              if (table === 'subscriptions' && key === 'status' && value === 'past_due') {
                calls.push({ table, operation: 'select.eq(status=past_due)', args: { key, value } })
                return mockResult(state.subscriptions ?? [])
              }
              return {
                order(col: string, opts?: Record<string, unknown>) {
                  return {
                    limit(n: number) {
                      return {
                        maybeSingle() {
                          calls.push({ table, operation: 'select.eq.order.limit.maybeSingle', args: { key, value } })
                          if (table === 'subscriptions') {
                            const subs = state.subscriptions ?? []
                            return mockResult(subs[0] ?? null)
                          }
                          return mockResult(null)
                        },
                      }
                    },
                  }
                },
                maybeSingle() {
                  calls.push({ table, operation: 'select.eq.maybeSingle', args: { key, value } })
                  if (table === 'subscriptions') {
                    const subs = state.subscriptions ?? []
                    return mockResult(subs[0] ?? null)
                  }
                  return mockResult(null)
                },
                single() {
                  calls.push({ table, operation: 'select.eq.single', args: { key, value } })
                  if (table === 'organizations') {
                    return mockResult(state.organization ?? null)
                  }
                  return mockResult(null)
                },
              }
            },
          }
        },
        update(data: unknown) {
          return {
            eq(key: string, value: unknown) {
              calls.push({ table, operation: 'update.eq', args: { data, key, value } })
              return mockResult(null)
            },
          }
        },
        insert(data: unknown) {
          calls.push({ table, operation: 'insert', args: data })
          return mockResult(null)
        },
      }
    },
  }

  return {
    supabase: api as unknown as SupabaseClient,
    calls,
  }
}

// ---------------------------------------------------------------------------
// Helper: create date N days ago
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dunning', () => {
  let dunning: typeof import('./dunning')
  let emailMock: typeof import('@/lib/email/email-transport')

  beforeEach(async () => {
    vi.resetModules()
    dunning = await import('./dunning')
    emailMock = await import('@/lib/email/email-transport')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handlePaymentFailed', () => {
    it('sets subscription status to past_due and initializes dunning state', async () => {
      const { supabase, calls } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          metadata: {},
          status: 'active',
        }],
      })

      await dunning.handlePaymentFailed(supabase, 'org_1', 'inv_123', 'Card declined')

      // Should update subscription to past_due
      const updateCall = calls.find(
        (c) => c.table === 'subscriptions' && c.operation === 'update.eq',
      )
      expect(updateCall).toBeDefined()
      const updateData = (updateCall!.args as Record<string, unknown>).data as Record<string, unknown>
      expect(updateData.status).toBe('past_due')

      // Metadata should contain dunning state and payment error
      const metadata = updateData.metadata as Record<string, unknown>
      expect(metadata.dunning).toBeDefined()
      expect((metadata.dunning as Record<string, unknown>).step).toBe(0)
      expect(metadata.payment_failed_at).toBeDefined()
      expect(metadata.payment_error).toBe('Card declined')
    })
  })

  describe('processDunningSequence', () => {
    it('sends step 1 email at day 1', async () => {
      const { supabase, calls } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          status: 'past_due',
          metadata: {
            payment_failed_at: daysAgo(1),
            dunning: { step: 0, lastEmailSentAt: null },
          },
        }],
        organization: {
          name: 'Test Org',
          metadata: { billing_email: 'billing@test.com' },
        },
      })

      await dunning.processDunningSequence(supabase)

      // Should have called sendCommandReplyEmail
      expect(emailMock.sendCommandReplyEmail).toHaveBeenCalledWith(
        'billing@test.com',
        'Payment Failed - Update Required',
        expect.stringContaining('Update Payment Method'),
      )
    })

    it('sends step 3 email at day 3', async () => {
      const { supabase } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          status: 'past_due',
          metadata: {
            payment_failed_at: daysAgo(3),
            dunning: { step: 1, lastEmailSentAt: daysAgo(2) },
          },
        }],
        organization: {
          name: 'Test Org',
          metadata: { billing_email: 'billing@test.com' },
        },
      })

      await dunning.processDunningSequence(supabase)

      expect(emailMock.sendCommandReplyEmail).toHaveBeenCalledWith(
        'billing@test.com',
        'Action Required - Update Payment to Keep Service Active',
        expect.stringContaining('Update Payment Now'),
      )
    })

    it('sends step 7 grace warning email', async () => {
      const { supabase } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          status: 'past_due',
          metadata: {
            payment_failed_at: daysAgo(7),
            dunning: { step: 3, lastEmailSentAt: daysAgo(4) },
          },
        }],
        organization: {
          name: 'Test Org',
          metadata: { billing_email: 'billing@test.com' },
        },
      })

      await dunning.processDunningSequence(supabase)

      expect(emailMock.sendCommandReplyEmail).toHaveBeenCalledWith(
        'billing@test.com',
        'Final Notice - Update Payment Within 7 Days',
        expect.stringContaining('Grace Period Ending'),
      )
    })

    it('downgrades to free at day 14', async () => {
      const { supabase, calls } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          status: 'past_due',
          metadata: {
            payment_failed_at: daysAgo(14),
            dunning: { step: 7, lastEmailSentAt: daysAgo(7) },
          },
        }],
        organization: {
          name: 'Test Org',
          metadata: { billing_email: 'billing@test.com' },
        },
      })

      await dunning.processDunningSequence(supabase)

      // Should have downgraded: status active, plan free
      const downgradeCall = calls.find(
        (c) => c.table === 'subscriptions' && c.operation === 'update.eq' &&
          (c.args as Record<string, unknown>).key === 'id',
      )
      expect(downgradeCall).toBeDefined()
      const downgradeData = (downgradeCall!.args as Record<string, unknown>).data as Record<string, unknown>
      expect(downgradeData.status).toBe('active')
      expect(downgradeData.plan).toBe('free')
      expect((downgradeData.metadata as Record<string, unknown>).downgrade_reason).toBe(
        'payment_failed_dunning_expired',
      )
    })
  })

  describe('resetDunningState', () => {
    it('clears dunning metadata and sets status to active', async () => {
      const { supabase, calls } = createMockSupabase({
        subscriptions: [{
          id: 'sub_1',
          org_id: 'org_1',
          status: 'past_due',
          metadata: {
            dunning: { step: 3, lastEmailSentAt: daysAgo(1) },
            payment_failed_at: daysAgo(3),
            payment_error: 'Card declined',
            show_payment_banner: true,
          },
        }],
      })

      await dunning.resetDunningState(supabase, 'org_1')

      // Should update subscription to active with cleared dunning metadata
      const updateCall = calls.find(
        (c) => c.table === 'subscriptions' && c.operation === 'update.eq',
      )
      expect(updateCall).toBeDefined()
      const updateData = (updateCall!.args as Record<string, unknown>).data as Record<string, unknown>
      expect(updateData.status).toBe('active')

      // Dunning fields should be removed
      const metadata = updateData.metadata as Record<string, unknown>
      expect(metadata.dunning).toBeUndefined()
      expect(metadata.payment_failed_at).toBeUndefined()
      expect(metadata.payment_error).toBeUndefined()
      expect(metadata.show_payment_banner).toBeUndefined()
      // Recovery timestamp should be set
      expect(metadata.dunning_recovered_at).toBeDefined()
    })
  })
})
