/**
 * Tier Feedback Loop Integration Tests
 *
 * End-to-end validation of the tier resolution flow: tool execution
 * records outcomes, reliability data accumulates, and the context block
 * surfaces that data back to the model for informed tier selection.
 *
 * CHAIN-01: Multi-tier fallback flow
 * CHAIN-02: Service-to-tier knowledge in context
 * CHAIN-03: Reliability tracking (success_rate changes)
 * CHAIN-04: Human handoff in tier chain
 * + Cold start: no data → still returns tier descriptions
 * + Error resilience: Supabase failures don't block execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  inferServiceName,
  formatReliabilityContext,
  recordExecution,
  getReliabilitySummary,
  type ReliabilitySummary,
  type ExecutionRecord,
} from '../reliability-tracker'
import {
  getTierForTool,
  buildTierContextBlock,
  recordToolOutcome,
  type TierType,
} from '../tool-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * In-memory execution store simulating the Supabase tables.
 * recordExecution inserts rows; getReliabilitySummary aggregates them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockSupabase(): any {
  const rows: Array<Record<string, unknown>> = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'execution_reliability') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            rows.push(row)
            return { error: null }
          }),
        }
      }
      if (table === 'execution_reliability_summary') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, orgId: string) => {
              // Aggregate rows by (service_name, tier) for the requested org
              const orgRows = rows.filter((r) => r.org_id === orgId)
              const groups = new Map<string, typeof orgRows>()
              for (const r of orgRows) {
                const key = `${r.service_name}|${r.tier}`
                if (!groups.has(key)) groups.set(key, [])
                groups.get(key)!.push(r)
              }

              const summaries: ReliabilitySummary[] = []
              for (const [key, groupRows] of groups) {
                const [service_name, tier] = key.split('|')
                const successes = groupRows.filter((r) => r.success).length
                const latencies = groupRows
                  .filter((r) => r.latency_ms != null)
                  .map((r) => r.latency_ms as number)

                summaries.push({
                  org_id: orgId,
                  service_name,
                  tier: tier as ReliabilitySummary['tier'],
                  total_executions: groupRows.length,
                  success_rate: groupRows.length > 0 ? successes / groupRows.length : 0,
                  avg_latency_ms:
                    latencies.length > 0
                      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
                      : null,
                  avg_cost_cents: null,
                  most_common_error:
                    groupRows.find((r) => r.error_message)?.error_message as string | null ?? null,
                })
              }

              return { data: summaries, error: null }
            }),
          })),
        }
      }
      return {}
    }),
    _rows: rows,
  }

  return supabase as unknown as ReturnType<typeof createMockSupabase> & {
    _rows: typeof rows
  }
}

function createFailingSupabase() {
  return {
    from: vi.fn(() => {
      throw new Error('Supabase connection refused')
    }),
  }
}

// ---------------------------------------------------------------------------
// CHAIN-01: Multi-tier fallback flow
// ---------------------------------------------------------------------------

describe('CHAIN-01: Multi-tier fallback flow', () => {
  let sb: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    sb = createMockSupabase()
  })

  it('records API failure, then updated context shows degraded success rate', async () => {
    // Step 1: Seed some successful API executions
    for (let i = 0; i < 4; i++) {
      await recordExecution(sb as never, {
        org_id: 'org-chain',
        service_name: 'gmail',
        tier: 'api',
        success: true,
        latency_ms: 200,
        tool_name: 'send_gmail',
      })
    }

    // Step 2: Record an API failure (the "fallback" trigger)
    await recordExecution(sb as never, {
      org_id: 'org-chain',
      service_name: 'gmail',
      tier: 'api',
      success: false,
      error_message: 'rate_limited',
      latency_ms: 50,
      tool_name: 'send_gmail',
    })

    // Step 3: Build context — should now reflect 80% success rate (4/5)
    const context = await buildTierContextBlock(sb as never, 'org-chain')

    // The context should contain tier descriptions regardless
    expect(context).toContain('Available Execution Tiers')

    // The reliability data should be included since we have rows
    const summaries = await getReliabilitySummary(sb as never, 'org-chain')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].service_name).toBe('gmail')
    expect(summaries[0].tier).toBe('api')
    expect(summaries[0].success_rate).toBe(0.8)
    expect(summaries[0].total_executions).toBe(5)
  })

  it('records failures across tiers and context reflects both', async () => {
    // API attempt fails
    await recordExecution(sb as never, {
      org_id: 'org-chain',
      service_name: 'stripe.com',
      tier: 'api',
      success: false,
      error_message: 'auth_expired',
      tool_name: 'stripe_charge',
    })

    // Browser fallback succeeds
    await recordExecution(sb as never, {
      org_id: 'org-chain',
      service_name: 'stripe.com',
      tier: 'browser',
      success: true,
      latency_ms: 15000,
      tool_name: 'spawn_browser_agent',
    })

    const summaries = await getReliabilitySummary(sb as never, 'org-chain')
    expect(summaries).toHaveLength(2)

    const apiEntry = summaries.find((s) => s.tier === 'api')!
    const browserEntry = summaries.find((s) => s.tier === 'browser')!

    expect(apiEntry.success_rate).toBe(0)
    expect(apiEntry.most_common_error).toBe('auth_expired')
    expect(browserEntry.success_rate).toBe(1)
    expect(browserEntry.avg_latency_ms).toBe(15000)
  })
})

// ---------------------------------------------------------------------------
// CHAIN-02: Service-to-tier knowledge in context
// ---------------------------------------------------------------------------

describe('CHAIN-02: Service-to-tier knowledge in context', () => {
  let sb: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    sb = createMockSupabase()
  })

  it('context block includes reliability table when seeded data exists', async () => {
    // Seed data for multiple services
    await recordExecution(sb as never, {
      org_id: 'org-ctx',
      service_name: 'gmail',
      tier: 'api',
      success: true,
      latency_ms: 200,
      tool_name: 'send_gmail',
    })
    await recordExecution(sb as never, {
      org_id: 'org-ctx',
      service_name: 'outlook',
      tier: 'api',
      success: true,
      latency_ms: 350,
      tool_name: 'send_outlook',
    })
    await recordExecution(sb as never, {
      org_id: 'org-ctx',
      service_name: 'example.com',
      tier: 'browser',
      success: false,
      error_message: 'timeout',
      latency_ms: 30000,
      tool_name: 'spawn_browser_agent',
    })

    const summaries = await getReliabilitySummary(sb as never, 'org-ctx')
    const contextTable = formatReliabilityContext(summaries)

    // Should have rows for all three services
    expect(contextTable).toContain('gmail')
    expect(contextTable).toContain('outlook')
    expect(contextTable).toContain('example.com')
    expect(contextTable).toContain('Tool Reliability (7-day)')
    expect(contextTable).toContain('timeout')
  })

  it('inferServiceName correctly maps tool names for context', () => {
    expect(inferServiceName('send_gmail')).toBe('gmail')
    expect(inferServiceName('send_outlook')).toBe('outlook')
    expect(inferServiceName('spawn_browser_agent', { url: 'https://www.stripe.com/dashboard' })).toBe('stripe.com')
    expect(inferServiceName('spawn_ephemeral_workspace')).toBe('workspace')
    expect(inferServiceName('search_contacts')).toBe('search_contacts')
  })

  it('getTierForTool maps all tools to correct tiers', () => {
    const expectations: [string, TierType][] = [
      ['send_gmail', 'api'],
      ['spawn_browser_agent', 'browser'],
      ['spawn_ephemeral_workspace', 'workspace'],
      ['workspace_exec', 'workspace'],
      ['request_human_handoff', 'human'],
      ['search_contacts', 'api'],
    ]

    for (const [tool, tier] of expectations) {
      expect(getTierForTool(tool)).toBe(tier)
    }
  })
})

// ---------------------------------------------------------------------------
// CHAIN-03: Reliability tracking (success_rate changes)
// ---------------------------------------------------------------------------

describe('CHAIN-03: Reliability tracking', () => {
  let sb: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    sb = createMockSupabase()
  })

  it('success rate changes as more executions are recorded', async () => {
    const orgId = 'org-rate'

    // 10 successes → 100%
    for (let i = 0; i < 10; i++) {
      await recordExecution(sb as never, {
        org_id: orgId,
        service_name: 'gmail',
        tier: 'api',
        success: true,
        tool_name: 'send_gmail',
      })
    }

    let summaries = await getReliabilitySummary(sb as never, orgId)
    expect(summaries[0].success_rate).toBe(1.0)
    expect(summaries[0].total_executions).toBe(10)

    // 5 failures → 10/15 = ~66.7%
    for (let i = 0; i < 5; i++) {
      await recordExecution(sb as never, {
        org_id: orgId,
        service_name: 'gmail',
        tier: 'api',
        success: false,
        error_message: 'rate_limited',
        tool_name: 'send_gmail',
      })
    }

    summaries = await getReliabilitySummary(sb as never, orgId)
    expect(summaries[0].total_executions).toBe(15)
    expect(summaries[0].success_rate).toBeCloseTo(0.667, 2)
  })

  it('recordToolOutcome integrates tier inference and recording', async () => {
    // Use the high-level recordToolOutcome which combines infer + getTier + record
    recordToolOutcome(sb as never, 'org-rto', 'send_gmail', { to: 'test@x.com' }, true, undefined, 150)

    // Give the fire-and-forget promise a tick to resolve
    await new Promise((r) => setTimeout(r, 10))

    const summaries = await getReliabilitySummary(sb as never, 'org-rto')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].service_name).toBe('gmail')
    expect(summaries[0].tier).toBe('api')
    expect(summaries[0].success_rate).toBe(1.0)
  })

  it('tracks multiple services independently', async () => {
    const orgId = 'org-multi'

    await recordExecution(sb as never, {
      org_id: orgId,
      service_name: 'gmail',
      tier: 'api',
      success: true,
      tool_name: 'send_gmail',
    })
    await recordExecution(sb as never, {
      org_id: orgId,
      service_name: 'outlook',
      tier: 'api',
      success: false,
      error_message: 'auth_failed',
      tool_name: 'send_outlook',
    })

    const summaries = await getReliabilitySummary(sb as never, orgId)
    expect(summaries).toHaveLength(2)

    const gmail = summaries.find((s) => s.service_name === 'gmail')!
    const outlook = summaries.find((s) => s.service_name === 'outlook')!

    expect(gmail.success_rate).toBe(1.0)
    expect(outlook.success_rate).toBe(0.0)
    expect(outlook.most_common_error).toBe('auth_failed')
  })
})

// ---------------------------------------------------------------------------
// CHAIN-04: Human handoff in tier chain
// ---------------------------------------------------------------------------

describe('CHAIN-04: Human handoff in tier chain', () => {
  let sb: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    sb = createMockSupabase()
  })

  it('browser failure followed by human handoff records both tiers', async () => {
    const orgId = 'org-handoff'

    // Browser attempt fails
    recordToolOutcome(
      sb as never,
      orgId,
      'spawn_browser_agent',
      { url: 'https://portal.example.com' },
      false,
      'MFA required — cannot proceed',
      25000,
    )
    await new Promise((r) => setTimeout(r, 10))

    // Human handoff is recorded
    recordToolOutcome(
      sb as never,
      orgId,
      'request_human_handoff',
      { description: 'MFA login needed', expected_result: 'Authenticated session' },
      true,
      undefined,
      0,
    )
    await new Promise((r) => setTimeout(r, 10))

    const summaries = await getReliabilitySummary(sb as never, orgId)

    // Should have entries for both browser and human tiers
    const browserEntry = summaries.find((s) => s.tier === 'browser')
    const humanEntry = summaries.find((s) => s.tier === 'human')

    expect(browserEntry).toBeDefined()
    expect(browserEntry!.success_rate).toBe(0)
    expect(browserEntry!.most_common_error).toBe('MFA required — cannot proceed')

    expect(humanEntry).toBeDefined()
    expect(humanEntry!.success_rate).toBe(1.0)
  })

  it('human tier records are tracked independently per service', async () => {
    const orgId = 'org-h2'

    // Two different human handoffs
    await recordExecution(sb as never, {
      org_id: orgId,
      service_name: 'request_human_handoff',
      tier: 'human',
      success: true,
      tool_name: 'request_human_handoff',
    })
    await recordExecution(sb as never, {
      org_id: orgId,
      service_name: 'request_human_handoff',
      tier: 'human',
      success: false,
      error_message: 'timeout_waiting_for_human',
      tool_name: 'request_human_handoff',
    })

    const summaries = await getReliabilitySummary(sb as never, orgId)
    const humanEntry = summaries.find((s) => s.tier === 'human')!

    expect(humanEntry.total_executions).toBe(2)
    expect(humanEntry.success_rate).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// Cold start: no data → still returns tier descriptions
// ---------------------------------------------------------------------------

describe('Cold start', () => {
  it('buildTierContextBlock returns tier descriptions with no reliability data', async () => {
    const sb = createMockSupabase()
    const context = await buildTierContextBlock(sb as never, 'org-fresh')

    expect(context).toContain('Available Execution Tiers')
    expect(context).toContain('API')
    expect(context).toContain('Browser')
    expect(context).toContain('Workspace')
    expect(context).toContain('Human')
    // Should NOT contain reliability guidance (no data)
    expect(context).not.toContain('Use this reliability data')
  })

  it('formatReliabilityContext returns empty string with no data', () => {
    expect(formatReliabilityContext([])).toBe('')
  })

  it('getReliabilitySummary returns empty array for fresh org', async () => {
    const sb = createMockSupabase()
    const summaries = await getReliabilitySummary(sb as never, 'org-nonexistent')
    expect(summaries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Error resilience: Supabase failures don't block execution
// ---------------------------------------------------------------------------

describe('Error resilience', () => {
  it('recordExecution does not throw when Supabase is down', async () => {
    const sb = createFailingSupabase()

    await expect(
      recordExecution(sb as never, {
        org_id: 'org-err',
        service_name: 'gmail',
        tier: 'api',
        success: true,
      }),
    ).resolves.toBeUndefined()
  })

  it('getReliabilitySummary returns [] when Supabase is down', async () => {
    const sb = createFailingSupabase()

    const result = await getReliabilitySummary(sb as never, 'org-err')
    expect(result).toEqual([])
  })

  it('buildTierContextBlock still returns tier descriptions when Supabase is down', async () => {
    const sb = createFailingSupabase()

    const context = await buildTierContextBlock(sb as never, 'org-err')

    // Should have static tier descriptions even though reliability query failed
    expect(context).toContain('Available Execution Tiers')
    expect(context).toContain('API')
    expect(context).toContain('Browser')
  })

  it('recordToolOutcome does not throw when Supabase is down', () => {
    const sb = createFailingSupabase()

    expect(() => {
      recordToolOutcome(sb as never, 'org-err', 'send_gmail', undefined, true)
    }).not.toThrow()
  })
})
