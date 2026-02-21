import { describe, it, expect, vi } from 'vitest'
import { shouldRunAgent, runScheduledAgents } from './scheduler'
import type { AgentSchedule } from '@/lib/bitbit-core'

const { logAgentRunMock, runSentryTickMock } = vi.hoisted(() => ({
  logAgentRunMock: vi.fn().mockResolvedValue({ id: 'run-123' }),
  runSentryTickMock: vi.fn().mockResolvedValue({
    processed: 1,
    triggered: 1,
    alertsCreated: 1,
  }),
}))

vi.mock('./run-logger', () => ({
  logAgentRun: logAgentRunMock,
}))

vi.mock('./sentry', () => ({
  runSentryTick: runSentryTickMock,
}))

// ---------------------------------------------------------------------------
// shouldRunAgent tests
// ---------------------------------------------------------------------------

describe('shouldRunAgent', () => {
  describe('interval schedule', () => {
    const schedule: AgentSchedule = { type: 'interval', interval_seconds: 300 }

    it('returns false when last run was 30s ago (not due)', () => {
      const now = new Date('2026-01-15T10:00:30Z')
      const lastRunAt = new Date('2026-01-15T10:00:00Z')
      expect(shouldRunAgent(schedule, lastRunAt, now)).toBe(false)
    })

    it('returns true when last run was 600s ago (due)', () => {
      const now = new Date('2026-01-15T10:10:00Z')
      const lastRunAt = new Date('2026-01-15T10:00:00Z')
      expect(shouldRunAgent(schedule, lastRunAt, now)).toBe(true)
    })

    it('returns true when never ran', () => {
      const now = new Date('2026-01-15T10:00:00Z')
      expect(shouldRunAgent(schedule, null, now)).toBe(true)
    })
  })

  describe('cron schedule', () => {
    it('*/5 * * * * matches minute 5', () => {
      const schedule: AgentSchedule = { type: 'cron', cron_expression: '*/5 * * * *' }
      const now = new Date('2026-01-15T10:05:00')
      expect(shouldRunAgent(schedule, null, now)).toBe(true)
    })

    it('*/5 * * * * does not match minute 3', () => {
      const schedule: AgentSchedule = { type: 'cron', cron_expression: '*/5 * * * *' }
      const now = new Date('2026-01-15T10:03:00')
      expect(shouldRunAgent(schedule, null, now)).toBe(false)
    })

    it('0 9 * * * matches at 09:00', () => {
      const schedule: AgentSchedule = { type: 'cron', cron_expression: '0 9 * * *' }
      const now = new Date('2026-01-15T09:00:00')
      expect(shouldRunAgent(schedule, null, now)).toBe(true)
    })

    it('0 9 * * * does not match at 09:01', () => {
      const schedule: AgentSchedule = { type: 'cron', cron_expression: '0 9 * * *' }
      const now = new Date('2026-01-15T09:01:00')
      expect(shouldRunAgent(schedule, null, now)).toBe(false)
    })
  })

  describe('continuous schedule', () => {
    it('always returns true', () => {
      const schedule: AgentSchedule = { type: 'continuous' }
      const now = new Date()
      expect(shouldRunAgent(schedule, null, now)).toBe(true)
      expect(shouldRunAgent(schedule, new Date(), now)).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// runScheduledAgents tests (with mocked Supabase)
// ---------------------------------------------------------------------------

function createMockSupabase(configs: Record<string, unknown>[], lastRuns: Record<string, unknown>[][] = []) {
  let callIndex = 0
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'agent_configs') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ data: configs, error: null }),
          })),
        }),
      }
    }
    if (table === 'agent_runs') {
      const runsForThisCall = lastRuns[callIndex] ?? []
      callIndex++
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: runsForThisCall, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: mockFrom } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('runScheduledAgents', () => {
  it('calls runSentryTick for due sentry configs', async () => {
    runSentryTickMock.mockClear()
    logAgentRunMock.mockClear()
    const configs = [
      {
        id: 'config-sentry',
        org_id: 'org-1',
        agent_type: 'sentry',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]
    const supabase = createMockSupabase(configs, [[]])

    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(1)
    expect(results[0].triggered).toBe(true)
    expect(runSentryTickMock).toHaveBeenCalledWith(supabase, 'org-1', 'config-sentry')
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })

  it('keeps existing behavior for non-sentry configs', async () => {
    runSentryTickMock.mockClear()
    logAgentRunMock.mockClear()
    const configs = [
      {
        id: 'config-other',
        org_id: 'org-1',
        agent_type: 'invoice-flow',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]
    const supabase = createMockSupabase(configs, [[]])

    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(1)
    expect(results[0].triggered).toBe(true)
    expect(runSentryTickMock).not.toHaveBeenCalled()
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })

  it('skips disabled agents (they are not returned by enabled=true query)', async () => {
    runSentryTickMock.mockClear()
    logAgentRunMock.mockClear()
    const supabase = createMockSupabase([])
    const results = await runScheduledAgents(supabase, 'org-1')
    expect(results).toHaveLength(0)
  })

  it('inserts agent_run for triggered agents', async () => {
    runSentryTickMock.mockClear()
    logAgentRunMock.mockClear()
    const configs = [
      {
        id: 'config-1',
        org_id: 'org-1',
        agent_type: 'sentry',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]
    const supabase = createMockSupabase(configs, [[]])
    const results = await runScheduledAgents(supabase, 'org-1')
    expect(results).toHaveLength(1)
    expect(results[0].triggered).toBe(true)
    expect(results[0].reason).toBe('due')
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })
})
