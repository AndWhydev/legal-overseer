import { describe, it, expect, vi } from 'vitest'
import { shouldRunAgent, runScheduledAgents } from './scheduler'
import type { AgentSchedule } from '@/lib/bitbit-core'

const {
  logAgentRunMock,
  runSentryTickMock,
  processSentryEscalationsMock,
  runLeadSwarmTickMock,
  runInvoiceFlowTickMock,
} = vi.hoisted(() => ({
  logAgentRunMock: vi.fn().mockResolvedValue({ id: 'run-123' }),
  runSentryTickMock: vi.fn().mockResolvedValue({
    processed: 1,
    triggered: 1,
    alertsCreated: 1,
  }),
  processSentryEscalationsMock: vi.fn().mockResolvedValue({
    processed: 1,
    escalated: 1,
    failed: 0,
  }),
  runLeadSwarmTickMock: vi.fn().mockResolvedValue({
    processed: 2,
    created: 1,
    qualified: 1,
    hot: 1,
    failed: 0,
  }),
  runInvoiceFlowTickMock: vi.fn().mockResolvedValue({
    processed: 3,
    created: 1,
    duplicatesBlocked: 1,
    sent: 1,
    overdue: 1,
    failed: 0,
  }),
}))

vi.mock('./run-logger', () => ({
  logAgentRun: logAgentRunMock,
}))

vi.mock('./sentry', () => ({
  runSentryTick: runSentryTickMock,
}))

vi.mock('./sentry-escalation', () => ({
  processSentryEscalations: processSentryEscalationsMock,
}))

vi.mock('./lead-swarm', () => ({
  runLeadSwarmTick: runLeadSwarmTickMock,
}))

vi.mock('./invoice-flow', () => ({
  runInvoiceFlowTick: runInvoiceFlowTickMock,
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
        select: vi.fn().mockImplementation(() => {
          const filters: Record<string, unknown> = {}
          const chain = {
            eq(key: string, value: unknown) {
              filters[key] = value
              return chain
            },
            then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
              const filtered = configs.filter((config) =>
                Object.entries(filters).every(([filterKey, filterValue]) => config[filterKey] === filterValue),
              )
              return Promise.resolve({ data: filtered, error: null }).then(resolve)
            },
          }
          return chain
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
    processSentryEscalationsMock.mockClear()
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
    expect(processSentryEscalationsMock).toHaveBeenCalledWith(supabase, 'org-1')
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })

  it('runs invoice-flow configs when due and logs deterministic counters', async () => {
    runInvoiceFlowTickMock.mockClear()
    logAgentRunMock.mockClear()

    const configs = [
      {
        id: 'config-invoice',
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
    expect(runInvoiceFlowTickMock).toHaveBeenCalledWith(supabase, 'org-1', 'config-invoice')

    const payload = logAgentRunMock.mock.calls[0]?.[1]
    expect(String(payload?.output_summary)).toContain('invoice-flow processed=3 created=1 duplicates=1 sent=1 overdue=1 failed=0')
  })

  it('skips disabled agents (they are not returned by enabled=true query)', async () => {
    runSentryTickMock.mockClear()
    processSentryEscalationsMock.mockClear()
    logAgentRunMock.mockClear()
    const supabase = createMockSupabase([])
    const results = await runScheduledAgents(supabase, 'org-1')
    expect(results).toHaveLength(0)
  })

  it('inserts agent_run for triggered agents', async () => {
    runSentryTickMock.mockClear()
    processSentryEscalationsMock.mockClear()
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

  it('processes each sentry org once per tick to avoid duplicate escalations', async () => {
    runSentryTickMock.mockClear()
    processSentryEscalationsMock.mockClear()
    logAgentRunMock.mockClear()

    const configs = [
      {
        id: 'config-1',
        org_id: 'org-1',
        agent_type: 'sentry',
        schedule: { type: 'continuous' },
        enabled: true,
      },
      {
        id: 'config-2',
        org_id: 'org-1',
        agent_type: 'sentry',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]

    const supabase = createMockSupabase(configs, [[], []])
    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(2)
    expect(results[0].triggered).toBe(true)
    expect(results[1].triggered).toBe(false)
    expect(results[1].reason).toBe('already_running')
    expect(runSentryTickMock).toHaveBeenCalledTimes(1)
    expect(processSentryEscalationsMock).toHaveBeenCalledTimes(1)
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })

  it('processes each invoice-flow org once per tick to avoid duplicate invoice processing', async () => {
    runInvoiceFlowTickMock.mockClear()
    logAgentRunMock.mockClear()

    const configs = [
      {
        id: 'config-1',
        org_id: 'org-1',
        agent_type: 'invoice-flow',
        schedule: { type: 'continuous' },
        enabled: true,
      },
      {
        id: 'config-2',
        org_id: 'org-1',
        agent_type: 'invoice-flow',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]

    const supabase = createMockSupabase(configs, [[], []])
    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(2)
    expect(results[0].triggered).toBe(true)
    expect(results[1].triggered).toBe(false)
    expect(results[1].reason).toBe('already_running')
    expect(runInvoiceFlowTickMock).toHaveBeenCalledTimes(1)
    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
  })

  it('includes escalation counts in scheduler output summary when no alerts are due', async () => {
    runSentryTickMock.mockClear()
    processSentryEscalationsMock.mockClear()
    logAgentRunMock.mockClear()
    processSentryEscalationsMock.mockResolvedValueOnce({ processed: 0, escalated: 0, failed: 0 })

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
    await runScheduledAgents(supabase, 'org-1')

    expect(logAgentRunMock).toHaveBeenCalledTimes(1)
    const payload = logAgentRunMock.mock.calls[0]?.[1]
    expect(String(payload?.output_summary)).toContain('escalated=0')
  })

  it('runs lead-swarm configs when due and logs deterministic counters', async () => {
    runLeadSwarmTickMock.mockClear()
    logAgentRunMock.mockClear()

    const configs = [
      {
        id: 'config-lead',
        org_id: 'org-1',
        agent_type: 'lead-swarm',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]

    const supabase = createMockSupabase(configs, [[]])
    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(1)
    expect(results[0].triggered).toBe(true)
    expect(runLeadSwarmTickMock).toHaveBeenCalledWith(supabase, 'org-1', 'config-lead')
    const payload = logAgentRunMock.mock.calls[0]?.[1]
    expect(String(payload?.output_summary)).toContain('lead-swarm processed=2 created=1 qualified=1 hot=1 failed=0')
  })

  it('skips non-due lead-swarm configs', async () => {
    runLeadSwarmTickMock.mockClear()
    logAgentRunMock.mockClear()

    const configs = [
      {
        id: 'config-lead',
        org_id: 'org-1',
        agent_type: 'lead-swarm',
        schedule: { type: 'interval', interval_seconds: 3600 },
        enabled: true,
      },
    ]

    const supabase = createMockSupabase(configs, [[{ created_at: new Date().toISOString() }]])
    const results = await runScheduledAgents(supabase, 'org-1')

    expect(results).toHaveLength(1)
    expect(results[0].triggered).toBe(false)
    expect(results[0].reason).toBe('not_due')
    expect(runLeadSwarmTickMock).not.toHaveBeenCalled()
    expect(logAgentRunMock).not.toHaveBeenCalled()
  })

  it('continues scheduler execution when lead-swarm reports failed messages', async () => {
    runLeadSwarmTickMock.mockClear()
    logAgentRunMock.mockClear()

    runLeadSwarmTickMock
      .mockResolvedValueOnce({ processed: 3, created: 1, qualified: 1, hot: 0, failed: 1 })
      .mockResolvedValueOnce({ processed: 2, created: 1, qualified: 1, hot: 1, failed: 0 })

    const configs = [
      {
        id: 'config-lead-1',
        org_id: 'org-1',
        agent_type: 'lead-swarm',
        schedule: { type: 'continuous' },
        enabled: true,
      },
      {
        id: 'config-lead-2',
        org_id: 'org-2',
        agent_type: 'lead-swarm',
        schedule: { type: 'continuous' },
        enabled: true,
      },
    ]

    const supabase = createMockSupabase(configs, [[], []])
    const results = await runScheduledAgents(supabase)

    expect(results).toHaveLength(2)
    expect(results[0].triggered).toBe(true)
    expect(results[1].triggered).toBe(true)
    expect(runLeadSwarmTickMock).toHaveBeenCalledTimes(2)
    expect(logAgentRunMock).toHaveBeenCalledTimes(2)
  })
})
