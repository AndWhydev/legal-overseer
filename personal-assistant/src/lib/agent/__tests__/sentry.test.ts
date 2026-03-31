import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateWatch,
  runSentryTick,
  buildRemediationSuggestion,
  type SentryWatch,
  type WatchEvaluation,
} from '../sentry'
import { createMockSupabase } from '@/lib/__test-helpers__/mock-supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWatch(overrides: Partial<SentryWatch> = {}): SentryWatch {
  return {
    id: 'watch-1',
    org_id: 'org-1',
    watch_type: 'error_keyword',
    description: 'test watch',
    conditions: { keywords: ['error'] },
    interval_seconds: 300,
    status: 'active',
    ...overrides,
  }
}

/**
 * Build a mock Supabase that supports the tables sentry uses:
 * watches, channel_messages, sentry_alerts.
 */
function buildSentrySupabase(opts: {
  watches?: SentryWatch[]
  messages?: Record<string, unknown>[]
}) {
  const state = {
    alerts: [] as Record<string, unknown>[],
    watchUpdates: [] as Record<string, unknown>[],
  }

  const supabase = {
    from(table: string) {
      if (table === 'watches') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(k: string, v: unknown) {
                filters[k] = v
                if (Object.keys(filters).length >= 2) {
                  const data = (opts.watches ?? []).filter(w =>
                    Object.entries(filters).every(([fk, fv]) => (w as any)[fk] === fv),
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
              eq(k: string, v: unknown) {
                filters[k] = v
                if (Object.keys(filters).length >= 2) {
                  state.watchUpdates.push({ ...filters, patch })
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
            return {
              eq() { return this },
              gte() { return this },
              order() { return this },
              limit() {
                return Promise.resolve({ data: opts.messages ?? [], error: null })
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
      throw new Error(`Unsupported table: ${table}`)
    },
  } as any

  return { supabase, state }
}

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// evaluateWatch
// ---------------------------------------------------------------------------

describe('evaluateWatch', () => {
  const now = new Date('2026-02-25T10:00:00Z')

  it('detects error keywords in messages', async () => {
    const { supabase } = buildSentrySupabase({
      messages: [
        { id: 'm1', org_id: 'org-1', subject: 'Error in deploy', body: 'failed to start', received_at: '2026-02-25T09:55:00Z' },
      ],
    })

    const result = await evaluateWatch(supabase, makeWatch({ conditions: { keywords: ['error'] } }), now)
    expect(result.triggered).toBe(true)
    expect(result.issueType).toBe('error_keyword')
    expect(result.severity).toBe('medium')
  })

  it('does not trigger when no keywords match', async () => {
    const { supabase } = buildSentrySupabase({
      messages: [
        { id: 'm1', org_id: 'org-1', subject: 'All good', body: 'deploy successful', received_at: '2026-02-25T09:55:00Z' },
      ],
    })

    const result = await evaluateWatch(supabase, makeWatch({ conditions: { keywords: ['error', 'failed'] } }), now)
    expect(result.triggered).toBe(false)
  })

  it('severity is high when 3+ messages match', async () => {
    const msgs = Array.from({ length: 4 }, (_, i) => ({
      id: `m${i}`, org_id: 'org-1', subject: 'error occurred', body: 'exception thrown',
      received_at: `2026-02-25T09:5${i}:00Z`,
    }))
    const { supabase } = buildSentrySupabase({ messages: msgs })

    const result = await evaluateWatch(supabase, makeWatch(), now)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('high')
  })

  it('handles uptime watch - endpoint down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const { supabase } = buildSentrySupabase({})

    const watch = makeWatch({ watch_type: 'uptime', conditions: { url: 'https://example.com/health' } })
    const result = await evaluateWatch(supabase, watch, now)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('handles uptime watch - endpoint healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const { supabase } = buildSentrySupabase({})

    const watch = makeWatch({ watch_type: 'uptime', conditions: { url: 'https://example.com/health' } })
    const result = await evaluateWatch(supabase, watch, now)
    expect(result.triggered).toBe(false)
  })

  it('handles uptime watch with no URL configured', async () => {
    const { supabase } = buildSentrySupabase({})
    const watch = makeWatch({ watch_type: 'uptime', conditions: {} })
    const result = await evaluateWatch(supabase, watch, now)
    expect(result.triggered).toBe(false)
    expect(result.evidence).toHaveProperty('reason', 'missing_url')
  })

  it('detects negative sentiment patterns', async () => {
    const { supabase } = buildSentrySupabase({
      messages: [
        { id: 'm1', org_id: 'org-1', sender: 'client@test.com', subject: 'Refund request', body: 'I want a refund immediately', received_at: '2026-02-25T09:55:00Z' },
      ],
    })

    const watch = makeWatch({ watch_type: 'negative_sentiment', conditions: { patterns: ['refund'] } })
    const result = await evaluateWatch(supabase, watch, now)
    expect(result.triggered).toBe(true)
    expect(result.issueType).toBe('negative_sentiment')
  })

  it('returns fallback for unsupported watch type', async () => {
    const { supabase } = buildSentrySupabase({})
    const watch = makeWatch({ watch_type: 'unknown_type' })
    const result = await evaluateWatch(supabase, watch, now)
    expect(result.triggered).toBe(false)
    expect(result.summary).toContain('Unsupported')
  })
})

// ---------------------------------------------------------------------------
// runSentryTick
// ---------------------------------------------------------------------------

describe('runSentryTick', () => {
  it('creates alerts for triggered watches and updates watch status', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-25T10:00:00Z'))

    const { supabase, state } = buildSentrySupabase({
      watches: [
        makeWatch({
          id: 'w1',
          next_check_at: '2026-02-25T09:59:00Z',
        }),
      ],
      messages: [
        { id: 'm1', org_id: 'org-1', subject: 'error alert', body: 'something failed', received_at: '2026-02-25T09:58:00Z' },
      ],
    })

    const result = await runSentryTick(supabase, 'org-1', 'agent-1')

    expect(result.processed).toBe(1)
    expect(result.triggered).toBe(1)
    expect(result.alertsCreated).toBe(1)
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0]).toHaveProperty('severity')
    expect(state.watchUpdates).toHaveLength(1)

    vi.useRealTimers()
  })

  it('skips watches that are not due', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-25T10:00:00Z'))

    const { supabase, state } = buildSentrySupabase({
      watches: [
        makeWatch({ id: 'w1', next_check_at: '2026-02-25T11:00:00Z' }),
      ],
    })

    const result = await runSentryTick(supabase, 'org-1', 'agent-1')
    expect(result.processed).toBe(0)
    expect(state.alerts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('returns zeros when no watches exist', async () => {
    const { supabase } = buildSentrySupabase({ watches: [] })
    const result = await runSentryTick(supabase, 'org-1', 'agent-1')
    expect(result).toEqual({ processed: 0, triggered: 0, alertsCreated: 0 })
  })
})

// ---------------------------------------------------------------------------
// buildRemediationSuggestion
// ---------------------------------------------------------------------------

describe('buildRemediationSuggestion', () => {
  it('returns deployment advice for 500 uptime errors', () => {
    const suggestion = buildRemediationSuggestion('uptime', { url: 'https://app.example.com', status: 500 })
    expect(suggestion).toContain('roll back')
  })

  it('returns reachability advice for non-500 uptime errors', () => {
    const suggestion = buildRemediationSuggestion('uptime', { url: 'https://app.example.com', status: 0 })
    expect(suggestion).toContain('reachability')
  })

  it('returns log inspection advice for error keywords', () => {
    const suggestion = buildRemediationSuggestion('error_keyword', { keywords: ['crash', 'error'] })
    expect(suggestion).toContain('logs')
    expect(suggestion).toContain('crash, error')
  })

  it('returns client acknowledgment advice for negative sentiment', () => {
    const suggestion = buildRemediationSuggestion('negative_sentiment', {})
    expect(suggestion).toContain('Acknowledge')
  })
})