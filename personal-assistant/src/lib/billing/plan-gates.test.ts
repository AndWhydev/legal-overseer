import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkPlanGate, type GateAction } from './plan-gates'

function createMockSupabase(args: {
  plan?: string
  channelCount?: number
  storageBytes?: number
  subscriptions?: Array<Record<string, unknown>>
  channels?: Array<Record<string, unknown>>
  files?: Array<Record<string, unknown>>
}) {
  const api = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) => ({
              in: (key: string, value: unknown) => ({
                order: (key: string, opts: unknown) => ({
                  limit: (count: number) => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: args.subscriptions?.[0] ?? { plan: args.plan ?? 'free' },
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'channel_configs') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) =>
              Promise.resolve({
                data: args.channels ?? (args.channelCount ? Array(args.channelCount).fill({}) : []),
                error: null,
              }),
          }),
        }
      }
      if (table === 'attachments') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) => {
              // Mock the size:sum aggregation
              const totalSize = args.files?.reduce((sum, f) => sum + (f.size as number), 0) ?? args.storageBytes ?? 0
              return Promise.resolve({
                data: [{ size: totalSize }],
                error: null,
              })
            },
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

describe('checkPlanGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('agent_runs action', () => {
    it('allows agent runs for any plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'free' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'agent_runs')
      expect(allowed).toBe(true)
    })

    it('allows agent runs for paid plans', async () => {
      const { supabase } = createMockSupabase({ plan: 'starter' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'agent_runs')
      expect(allowed).toBe(true)
    })
  })

  describe('channels action', () => {
    it('allows adding channel when under limit', async () => {
      const { supabase } = createMockSupabase({
        plan: 'starter',
        channelCount: 2, // starter has maxChannels=3
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'channels')
      expect(allowed).toBe(true)
    })

    it('denies adding channel when at limit', async () => {
      const { supabase } = createMockSupabase({
        plan: 'free',
        channelCount: 1, // free has maxChannels=1
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'channels')
      expect(allowed).toBe(false)
    })

    it('allows channels for scale plan', async () => {
      const { supabase } = createMockSupabase({
        plan: 'scale',
        channelCount: 50, // scale has maxChannels=99
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'channels')
      expect(allowed).toBe(true)
    })
  })

  describe('storage action', () => {
    it('allows storage when under limit', async () => {
      const { supabase } = createMockSupabase({
        plan: 'starter',
        storageBytes: 100 * 1024 * 1024, // 100 MB, starter limit is 500 MB
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'storage')
      expect(allowed).toBe(true)
    })

    it('denies storage when over limit', async () => {
      const { supabase } = createMockSupabase({
        plan: 'free',
        storageBytes: 101 * 1024 * 1024, // 101 MB, free limit is 100 MB
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'storage')
      expect(allowed).toBe(false)
    })

    it('allows unlimited storage for scale plan', async () => {
      const { supabase } = createMockSupabase({
        plan: 'scale',
        files: [{ size: 50000 * 1024 * 1024 }], // 50GB, scale limit is 99999MB
      })

      const allowed = await checkPlanGate(supabase, 'org-1', 'storage')
      expect(allowed).toBe(true)
    })
  })

  describe('whatsapp action', () => {
    it('denies whatsapp for free plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'free' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'whatsapp')
      expect(allowed).toBe(false)
    })

    it('allows whatsapp for starter plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'starter' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'whatsapp')
      expect(allowed).toBe(true)
    })

    it('allows whatsapp for growth plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'growth' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'whatsapp')
      expect(allowed).toBe(true)
    })
  })

  describe('proposals action', () => {
    it('denies proposals for free plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'free' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'proposals')
      expect(allowed).toBe(false)
    })

    it('denies proposals for starter plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'starter' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'proposals')
      expect(allowed).toBe(false)
    })

    it('allows proposals for growth plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'growth' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'proposals')
      expect(allowed).toBe(true)
    })

    it('allows proposals for scale plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'scale' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'proposals')
      expect(allowed).toBe(true)
    })
  })

  describe('multi_user action', () => {
    it('denies multi_user for free plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'free' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'multi_user')
      expect(allowed).toBe(false)
    })

    it('denies multi_user for starter plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'starter' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'multi_user')
      expect(allowed).toBe(false)
    })

    it('allows multi_user for growth plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'growth' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'multi_user')
      expect(allowed).toBe(true)
    })

    it('allows multi_user for scale plan', async () => {
      const { supabase } = createMockSupabase({ plan: 'scale' })
      const allowed = await checkPlanGate(supabase, 'org-1', 'multi_user')
      expect(allowed).toBe(true)
    })
  })

  describe('error handling', () => {
    it('allows action on plan lookup error', async () => {
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

      const allowed = await checkPlanGate(
        failingSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
        'org-1',
        'channels',
      )

      expect(allowed).toBe(true)
    })

    it('allows action on channel count query error', async () => {
      const failingSupabase = {
        from: (table: string) => {
          if (table === 'subscriptions') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () =>
                          Promise.resolve({
                            data: { plan: 'starter' },
                            error: null,
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          if (table === 'channel_configs') {
            return {
              select: () => ({
                eq: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Query error' },
                  }),
              }),
            }
          }
          throw new Error(`Unsupported table ${table}`)
        },
      }

      const allowed = await checkPlanGate(
        failingSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
        'org-1',
        'channels',
      )

      expect(allowed).toBe(true)
    })

    it('allows action on storage query error', async () => {
      const failingSupabase = {
        from: (table: string) => {
          if (table === 'subscriptions') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () =>
                          Promise.resolve({
                            data: { plan: 'free' },
                            error: null,
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          if (table === 'attachments') {
            return {
              select: () => ({
                eq: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Query error' },
                  }),
              }),
            }
          }
          throw new Error(`Unsupported table ${table}`)
        },
      }

      const allowed = await checkPlanGate(
        failingSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
        'org-1',
        'storage',
      )

      expect(allowed).toBe(true)
    })
  })
})
