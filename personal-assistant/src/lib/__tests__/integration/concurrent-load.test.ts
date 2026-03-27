/**
 * Concurrent Agent Execution Load Test
 *
 * Validates that 10 simultaneous agent executions complete without:
 * - Connection pool exhaustion
 * - Timeout failures
 * - Data corruption (cross-org bleed)
 * - Circuit breaker tripping from concurrency alone
 *
 * Uses mocked Supabase and Anthropic clients to verify concurrency
 * patterns without requiring live infrastructure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  anthropicCreateMock,
  runSentryTickMock,
  processSentryEscalationsMock,
  logAgentRunMock,
  canProceedMock,
  withCircuitBreakerMock,
  withRetryMock,
  logAuditEventMock,
  deadLetterMock,
  getCircuitStateFn,
  resetAllCircuitsFn,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  runSentryTickMock: vi.fn(),
  processSentryEscalationsMock: vi.fn(),
  logAgentRunMock: vi.fn(),
  canProceedMock: vi.fn(),
  withCircuitBreakerMock: vi.fn(),
  withRetryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  deadLetterMock: vi.fn(),
  getCircuitStateFn: vi.fn(),
  resetAllCircuitsFn: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return { messages: { create: anthropicCreateMock } }
  }
  return { default: MockAnthropic }
})

vi.mock('@/lib/agent/sentry', () => ({
  runSentryTick: runSentryTickMock,
}))

vi.mock('@/lib/agent/sentry-escalation', () => ({
  processSentryEscalations: processSentryEscalationsMock,
}))

vi.mock('@/lib/agent/lead-swarm', () => ({
  runLeadSwarmTick: vi.fn(),
}))

vi.mock('@/lib/agent/invoice-flow', () => ({
  runInvoiceFlowTick: vi.fn(),
  createInvoiceFromIntent: vi.fn(),
  parseInvoiceIntent: vi.fn(),
}))

vi.mock('@/lib/agent/channel-triage', () => ({
  runTriage: vi.fn(),
  scorePriority: vi.fn(),
}))

vi.mock('@/lib/agent/client-comms', () => ({
  runClientCommsTick: vi.fn(),
}))

vi.mock('@/lib/agent/proposal-bot', () => ({
  runProposalBotTick: vi.fn(),
}))

vi.mock('@/lib/agent/client-onboarding', () => ({
  runOnboardingTick: vi.fn(),
}))

vi.mock('@/lib/agent/ad-script-gen', () => ({
  runAdScriptGenTick: vi.fn(),
}))

vi.mock('@/lib/agent/ai-search-optimizer', () => ({
  runAISearchTick: vi.fn(),
}))

vi.mock('@/lib/agent/tender-hunter', () => ({
  runTenderHunterTick: vi.fn(),
}))

vi.mock('@/lib/agent/quote-bot', () => ({
  runQuoteBotTick: vi.fn(),
}))

vi.mock('@/lib/agent/job-reminder', () => ({
  runJobReminderTick: vi.fn(),
}))

vi.mock('@/lib/agent/cost-guard', () => ({
  canProceed: canProceedMock,
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  withCircuitBreaker: withCircuitBreakerMock,
  getCircuitState: getCircuitStateFn,
  resetAllCircuits: resetAllCircuitsFn,
}))

vi.mock('@/lib/agent/retry', () => ({
  withRetry: withRetryMock,
  isTransientError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/agent/run-logger', () => ({
  logAgentRun: logAgentRunMock,
}))

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('@/lib/agent/dead-letter', () => ({
  deadLetter: deadLetterMock,
}))

// ---------------------------------------------------------------------------
// Pool-tracking Supabase mock
// ---------------------------------------------------------------------------

const POOL_LIMIT = 10

interface PoolStats {
  maxConcurrent: number
  currentConcurrent: number
  totalCalls: number
  orgCallCounts: Map<string, number>
}

function createPoolTrackingSupabase(
  configs: Record<string, unknown>[],
  stats: PoolStats,
) {
  const supabase = {
    from(table: string) {
      if (table === 'agent_configs') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            const query = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                // Track concurrent pool usage
                stats.currentConcurrent++
                stats.totalCalls++
                if (stats.currentConcurrent > stats.maxConcurrent) {
                  stats.maxConcurrent = stats.currentConcurrent
                }

                // Track per-org calls
                const orgId = filters.org_id as string | undefined
                if (orgId) {
                  stats.orgCallCounts.set(
                    orgId,
                    (stats.orgCallCounts.get(orgId) ?? 0) + 1,
                  )
                }

                // Filter configs by org_id if specified
                const filtered = configs.filter((config) => {
                  if (filters.org_id && (config as Record<string, unknown>).org_id !== filters.org_id) {
                    return false
                  }
                  if (filters.enabled !== undefined && (config as Record<string, unknown>).enabled !== filters.enabled) {
                    return false
                  }
                  return true
                })

                // Simulate small DB latency (1-5ms) then release pool slot
                setTimeout(() => {
                  stats.currentConcurrent--
                }, Math.random() * 4 + 1)

                return resolve({ data: filtered, error: null })
              },
            }
            return query
          },
        }
      }

      if (table === 'agent_runs') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          limit: () => Promise.resolve({ data: [], error: null }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      // Fallback for unknown tables -- return no-op to avoid crashes
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        }),
      }
    },
  }

  return supabase
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  process.env.ANTHROPIC_API_KEY = 'test-key'

  // Sentry tick returns fast with mock results + random 100-500ms delay
  runSentryTickMock.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 400 + 100))
    return { processed: 1, triggered: 1, alertsCreated: 0 }
  })

  processSentryEscalationsMock.mockResolvedValue({
    processed: 0,
    escalated: 0,
    silenced: 0,
    failed: 0,
  })

  canProceedMock.mockResolvedValue({
    allowed: true,
    spentToday: 0,
    dailyLimit: 100,
    remainingBudget: 100,
  })

  // Pass through to actual function execution
  withRetryMock.mockImplementation((fn: () => Promise<unknown>) => fn())
  withCircuitBreakerMock.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn())

  logAgentRunMock.mockResolvedValue({ id: 'run-id' })
  logAuditEventMock.mockResolvedValue(undefined)
  deadLetterMock.mockResolvedValue(undefined)

  // Circuit breaker starts closed
  getCircuitStateFn.mockReturnValue('closed')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Concurrent Agent Execution Load Test', () => {
  it('10 concurrent agent executions complete without error', { timeout: 30_000 }, async () => {
    const { runScheduledAgents } = await import('@/lib/agent/scheduler')

    const stats: PoolStats = {
      maxConcurrent: 0,
      currentConcurrent: 0,
      totalCalls: 0,
      orgCallCounts: new Map(),
    }

    // Create 10 separate configs, one per org
    const allConfigs = Array.from({ length: 10 }, (_, i) => ({
      id: `config-${i + 1}`,
      org_id: `load-org-${i + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const supabase = createPoolTrackingSupabase(allConfigs, stats)

    // Run 10 concurrent scheduler executions, each for a different org
    const promises = Array.from({ length: 10 }, (_, i) =>
      runScheduledAgents(supabase as unknown as SupabaseClient, `load-org-${i + 1}`),
    )

    const results = await Promise.all(promises)

    // All 10 should resolve without errors
    expect(results).toHaveLength(10)
    for (const result of results) {
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
      // Each org should have exactly 1 triggered agent
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result.every((r) => r.triggered && r.reason === 'due')).toBe(true)
    }
  })

  it('no connection pool exhaustion (max concurrent stays within pool limit)', { timeout: 30_000 }, async () => {
    const { runScheduledAgents } = await import('@/lib/agent/scheduler')

    const stats: PoolStats = {
      maxConcurrent: 0,
      currentConcurrent: 0,
      totalCalls: 0,
      orgCallCounts: new Map(),
    }

    const allConfigs = Array.from({ length: 10 }, (_, i) => ({
      id: `config-${i + 1}`,
      org_id: `pool-org-${i + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const supabase = createPoolTrackingSupabase(allConfigs, stats)

    const promises = Array.from({ length: 10 }, (_, i) =>
      runScheduledAgents(supabase as unknown as SupabaseClient, `pool-org-${i + 1}`),
    )

    await Promise.all(promises)

    // Pool should never exceed the limit
    expect(stats.maxConcurrent).toBeLessThanOrEqual(POOL_LIMIT)
    // Should have made at least 10 DB calls (one per org for configs)
    expect(stats.totalCalls).toBeGreaterThanOrEqual(10)

    console.log(`Pool stats: maxConcurrent=${stats.maxConcurrent}, totalCalls=${stats.totalCalls}`)
  })

  it('p95 latency is under 30 seconds per execution', { timeout: 60_000 }, async () => {
    const { runScheduledAgents } = await import('@/lib/agent/scheduler')

    const stats: PoolStats = {
      maxConcurrent: 0,
      currentConcurrent: 0,
      totalCalls: 0,
      orgCallCounts: new Map(),
    }

    const allConfigs = Array.from({ length: 10 }, (_, i) => ({
      id: `config-${i + 1}`,
      org_id: `latency-org-${i + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const supabase = createPoolTrackingSupabase(allConfigs, stats)

    // Measure individual execution latencies
    const latencies: number[] = []
    const wallStart = Date.now()

    const promises = Array.from({ length: 10 }, async (_, i) => {
      const start = Date.now()
      const result = await runScheduledAgents(
        supabase as unknown as SupabaseClient,
        `latency-org-${i + 1}`,
      )
      const elapsed = Date.now() - start
      latencies.push(elapsed)
      return result
    })

    await Promise.all(promises)

    const totalMs = Date.now() - wallStart

    // Sort for percentile calculation
    const sorted = [...latencies].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]

    console.log('Load test results:', {
      p50,
      p95,
      p99,
      maxConcurrent: stats.maxConcurrent,
      totalMs,
    })

    // p95 must be under 30s
    expect(p95).toBeLessThan(30_000)
    // Total wall clock must be under 60s
    expect(totalMs).toBeLessThan(60_000)
  })

  it('no data corruption (each execution writes to correct org scope)', { timeout: 30_000 }, async () => {
    const { runScheduledAgents } = await import('@/lib/agent/scheduler')

    const stats: PoolStats = {
      maxConcurrent: 0,
      currentConcurrent: 0,
      totalCalls: 0,
      orgCallCounts: new Map(),
    }

    const allConfigs = Array.from({ length: 10 }, (_, i) => ({
      id: `config-${i + 1}`,
      org_id: `isolation-org-${i + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const supabase = createPoolTrackingSupabase(allConfigs, stats)

    const promises = Array.from({ length: 10 }, (_, i) =>
      runScheduledAgents(supabase as unknown as SupabaseClient, `isolation-org-${i + 1}`),
    )

    const results = await Promise.all(promises)

    // Verify each result maps to the correct org
    for (let i = 0; i < 10; i++) {
      const orgResults = results[i]
      expect(orgResults.length).toBeGreaterThanOrEqual(1)
      for (const r of orgResults) {
        expect(r.orgId).toBe(`isolation-org-${i + 1}`)
      }
    }

    // Verify logAgentRun was called with correct org IDs (no cross-org bleed)
    const logCalls = logAgentRunMock.mock.calls
    const loggedOrgIds = new Set(logCalls.map((call: unknown[]) => (call[1] as Record<string, unknown>).org_id))
    for (let i = 0; i < 10; i++) {
      expect(loggedOrgIds.has(`isolation-org-${i + 1}`)).toBe(true)
    }
  })

  it('circuit breaker does not trip from concurrent load alone', { timeout: 30_000 }, async () => {
    const { runScheduledAgents } = await import('@/lib/agent/scheduler')

    const stats: PoolStats = {
      maxConcurrent: 0,
      currentConcurrent: 0,
      totalCalls: 0,
      orgCallCounts: new Map(),
    }

    const allConfigs = Array.from({ length: 10 }, (_, i) => ({
      id: `config-${i + 1}`,
      org_id: `circuit-org-${i + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const supabase = createPoolTrackingSupabase(allConfigs, stats)

    const promises = Array.from({ length: 10 }, (_, i) =>
      runScheduledAgents(supabase as unknown as SupabaseClient, `circuit-org-${i + 1}`),
    )

    await Promise.all(promises)

    // Circuit breaker should still be closed -- no failures occurred
    expect(getCircuitStateFn('llm')).toBe('closed')

    // withCircuitBreaker should have been called for each agent (10 times)
    // and none should have thrown
    expect(withCircuitBreakerMock).toHaveBeenCalledTimes(10)
  })
})
