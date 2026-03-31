import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildRemediationSuggestion,
  evaluateWatch,
  runSentryTick,
  type SentryWatch,
} from './sentry'

interface MockMessage {
  id: string
  org_id: string
  sender?: string
  subject?: string
  body?: string
  received_at: string
}

function createMockSupabase(args: {
  watches: SentryWatch[]
  messages?: MockMessage[]
}) {
  const state = {
    watches: [...args.watches],
    messages: [...(args.messages ?? [])],
    watchUpdates: [] as Array<{ id: string; orgId: string; patch: Record<string, unknown> }>,
    alerts: [] as Array<Record<string, unknown>>,
  }

  const api = {
    from(table: string) {
      if (table === 'watches') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (Object.keys(filters).length >= 2) {
                  const data = state.watches.filter((watch) =>
                    Object.entries(filters).every(([filterKey, filterValue]) =>
                      (watch as unknown as Record<string, unknown>)[filterKey] === filterValue,
                    ),
                  )
                  return Promise.resolve({ data, error: null })
                }
                return this
              },
            }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (Object.keys(filters).length >= 2) {
                  state.watchUpdates.push({
                    id: String(filters.id),
                    orgId: String(filters.org_id),
                    patch,
                  })
                  return Promise.resolve({ data: null, error: null })
                }
                return this
              },
            }
          },
        }
      }

      if (table === 'channel_messages') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              gte(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              order() {
                return this
              },
              limit() {
                const data = state.messages.filter((message) => {
                  const orgMatch =
                    filters.org_id === undefined || message.org_id === String(filters.org_id)
                  const since =
                    filters.received_at !== undefined
                      ? new Date(String(filters.received_at)).getTime()
                      : Number.MIN_SAFE_INTEGER
                  const messageAt = new Date(message.received_at).getTime()
                  return orgMatch && messageAt >= since
                })
                return Promise.resolve({ data, error: null })
              },
            }
          },
        }
      }

      if (table === 'sentry_alerts') {
        return {
          select() {
            return {
              eq() { return this },
              in() { return this },
              is() { return this },
              limit() { return this },
              maybeSingle() { return Promise.resolve({ data: null, error: null }) },
            }
          },
          insert(payload: Record<string, unknown>) {
            state.alerts.push(payload)
            return Promise.resolve({ data: null, error: null })
          },
        }
      }

      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
    state,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runSentryTick', () => {
  it('processes only due watches using next_check_at and interval fallback', async () => {
    const now = new Date('2026-02-22T10:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const { supabase, state } = createMockSupabase({
      watches: [
        {
          id: 'watch-due-next-check',
          org_id: 'org-1',
          watch_type: 'error_keyword',
          description: 'due via next_check_at',
          conditions: { keywords: ['error'] },
          interval_seconds: 300,
          next_check_at: '2026-02-22T09:59:00.000Z',
          status: 'active',
        },
        {
          id: 'watch-not-due-next-check',
          org_id: 'org-1',
          watch_type: 'error_keyword',
          description: 'not due yet',
          conditions: { keywords: ['error'] },
          interval_seconds: 300,
          next_check_at: '2026-02-22T10:30:00.000Z',
          status: 'active',
        },
        {
          id: 'watch-due-interval',
          org_id: 'org-1',
          watch_type: 'error_keyword',
          description: 'due via interval fallback',
          conditions: { keywords: ['error'] },
          interval_seconds: 60,
          last_checked_at: '2026-02-22T09:58:00.000Z',
          status: 'active',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          org_id: 'org-1',
          subject: 'error in checkout',
          body: 'customer reported error',
          received_at: '2026-02-22T09:59:30.000Z',
        },
      ],
    })

    const result = await runSentryTick(supabase, 'org-1', 'config-1')

    expect(result.processed).toBe(2)
    expect(result.triggered).toBe(2)
    expect(state.watchUpdates).toHaveLength(2)
    expect(state.alerts).toHaveLength(2)

    vi.useRealTimers()
  })
})

describe('evaluateWatch', () => {
  it('triggers for matching error keywords and does not trigger otherwise', async () => {
    const { supabase } = createMockSupabase({
      watches: [],
      messages: [
        {
          id: 'msg-1',
          org_id: 'org-1',
          subject: 'Critical error in worker',
          body: 'Process crashed',
          received_at: '2026-02-22T09:59:00.000Z',
        },
      ],
    })

    const watch: SentryWatch = {
      id: 'watch-1',
      org_id: 'org-1',
      watch_type: 'error_keyword',
      description: 'error detector',
      conditions: { keywords: ['critical error'] },
      interval_seconds: 300,
      status: 'active',
    }

    const positive = await evaluateWatch(supabase, watch, new Date('2026-02-22T10:00:00.000Z'))
    expect(positive.triggered).toBe(true)

    const negative = await evaluateWatch(
      supabase,
      { ...watch, conditions: { keywords: ['totally-missing-keyword'] } },
      new Date('2026-02-22T10:00:00.000Z'),
    )
    expect(negative.triggered).toBe(false)
  })

  it('triggers uptime watch on 500 and not on 200', async () => {
    const { supabase } = createMockSupabase({ watches: [] })
    const watch: SentryWatch = {
      id: 'watch-up',
      org_id: 'org-1',
      watch_type: 'uptime',
      description: 'uptime',
      conditions: { url: 'https://example.com/health' },
      interval_seconds: 300,
      status: 'active',
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const failure = await evaluateWatch(supabase, watch, new Date())
    expect(failure.triggered).toBe(true)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const success = await evaluateWatch(supabase, watch, new Date())
    expect(success.triggered).toBe(false)
  })

  it('triggers negative sentiment watch for matched patterns', async () => {
    const { supabase } = createMockSupabase({
      watches: [],
      messages: [
        {
          id: 'msg-neg',
          org_id: 'org-1',
          sender: 'client@example.com',
          subject: 'Need refund now',
          body: 'This is unacceptable service',
          received_at: '2026-02-22T09:59:00.000Z',
        },
      ],
    })

    const watch: SentryWatch = {
      id: 'watch-neg',
      org_id: 'org-1',
      watch_type: 'negative_sentiment',
      description: 'negative sentiment',
      conditions: { patterns: ['refund', 'unacceptable'] },
      interval_seconds: 300,
      status: 'active',
    }

    const positive = await evaluateWatch(supabase, watch, new Date('2026-02-22T10:00:00.000Z'))
    expect(positive.triggered).toBe(true)

    const negative = await evaluateWatch(
      supabase,
      { ...watch, conditions: { patterns: ['all-good'] } },
      new Date('2026-02-22T10:00:00.000Z'),
    )
    expect(negative.triggered).toBe(false)
  })

  it('builds issue-specific remediation suggestions', () => {
    const uptime = buildRemediationSuggestion('uptime', {
      url: 'https://example.com/health',
      status: 500,
    })
    const keyword = buildRemediationSuggestion('error_keyword', { keywords: ['error'] })
    const sentiment = buildRemediationSuggestion('negative_sentiment', { patterns: ['refund'] })

    expect(uptime.length).toBeGreaterThan(20)
    expect(keyword.length).toBeGreaterThan(20)
    expect(sentiment.length).toBeGreaterThan(20)
    expect(uptime.toLowerCase()).toContain('roll back')
    expect(keyword.toLowerCase()).toContain('logs')
    expect(sentiment.toLowerCase()).toContain('acknowledge')
  })
})