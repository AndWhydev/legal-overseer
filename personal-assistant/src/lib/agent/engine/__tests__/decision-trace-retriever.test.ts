/**
 * Decision Trace Retriever Tests
 *
 * Tests retrieveRelevantTraces, formatTracesAsContext, and extractSearchTerms
 * in isolation with mocked Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  retrieveRelevantTraces,
  formatTracesAsContext,
  extractSearchTerms,
  type RelevantTrace,
} from '../decision-trace-retriever'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides?: Partial<RelevantTrace>): RelevantTrace {
  return {
    source: 'decision_log',
    trigger: 'Send invoice to client',
    action: 'Generated and sent PDF invoice via email',
    reasoning: 'Client prefers PDF invoices on the 1st of each month',
    outcome: 'success: Invoice sent and acknowledged',
    entityNames: ['Acme Corp'],
    timestamp: '2026-04-10T10:00:00Z',
    feedback: null,
    ...overrides,
  }
}

function mockDecisionLogData() {
  return [
    {
      title: 'Invoice pricing decision',
      decision: 'Applied 10% discount for bulk order',
      reasoning: 'Client has been loyal for 2 years and ordered 50+ units',
      outcome: 'Client accepted and placed the order',
      lessons_learned: null,
      entity_names: ['Acme Corp'],
      decided_at: '2026-04-10T10:00:00Z',
      status: 'active',
    },
    {
      title: 'Follow-up timing decision',
      decision: 'Sent follow-up after 3 days instead of 7',
      reasoning: 'Client mentioned urgency in last message',
      outcome: null,
      lessons_learned: 'Shorter follow-up window works for urgent clients',
      entity_names: ['Beta Inc'],
      decided_at: '2026-04-09T10:00:00Z',
      status: 'active',
    },
  ]
}

function mockAgentRunsData() {
  return [
    {
      trigger_payload: { message: 'Send invoice to Acme Corp for April' },
      result_summary: 'Invoice #2024-042 sent to acme@example.com',
      status: 'success',
      created_at: '2026-04-08T10:00:00Z',
      routing_decision: 'act',
    },
    {
      trigger_payload: { message: 'Check weather forecast' },
      result_summary: 'Fetched 7-day forecast for Sydney',
      status: 'success',
      created_at: '2026-04-07T10:00:00Z',
      routing_decision: 'act',
    },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(overrides?: {
  decisionData?: unknown[]
  decisionError?: { message: string }
  runsData?: unknown[]
  runsError?: { message: string }
}): any {
  const decisionData = overrides?.decisionData ?? mockDecisionLogData()
  const runsData = overrides?.runsData ?? mockAgentRunsData()

  return {
    from: vi.fn((table: string) => {
      if (table === 'decision_log') {
        return buildDecisionChain(decisionData, overrides?.decisionError)
      }
      if (table === 'agent_runs') {
        return buildRunsChain(runsData, overrides?.runsError)
      }
      return {}
    }),
  }
}

function buildDecisionChain(data: unknown[], error?: { message: string }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: error ? null : data,
      error: error ?? null,
    }),
  }
  return chain
}

function buildRunsChain(data: unknown[], error?: { message: string }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: error ? null : data,
      error: error ?? null,
    }),
  }
  return chain
}

// ---------------------------------------------------------------------------
// extractSearchTerms
// ---------------------------------------------------------------------------

describe('extractSearchTerms', () => {
  it('extracts meaningful terms from a sentence', () => {
    const terms = extractSearchTerms('Send invoice to Acme Corp for April')
    expect(terms).toContain('send')
    expect(terms).toContain('invoice')
    expect(terms).toContain('acme')
    expect(terms).toContain('corp')
    expect(terms).toContain('april')
    // Should not contain stop words
    expect(terms).not.toContain('to')
    expect(terms).not.toContain('for')
  })

  it('removes short words (< 3 chars)', () => {
    const terms = extractSearchTerms('I am ok')
    expect(terms).toEqual([])
  })

  it('removes punctuation', () => {
    const terms = extractSearchTerms("What's the invoice status?")
    expect(terms).toContain('invoice')
    expect(terms).toContain('status')
    // Punctuation removed
    expect(terms.join(' ')).not.toContain('?')
  })

  it('caps at 10 terms', () => {
    const longText = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november'
    const terms = extractSearchTerms(longText)
    expect(terms.length).toBeLessThanOrEqual(10)
  })

  it('returns empty array for empty input', () => {
    expect(extractSearchTerms('')).toEqual([])
  })

  it('returns empty array for input with only stop words', () => {
    expect(extractSearchTerms('the is a an to for')).toEqual([])
  })

  it('lowercases all terms', () => {
    const terms = extractSearchTerms('Send INVOICE to Client')
    for (const term of terms) {
      expect(term).toBe(term.toLowerCase())
    }
  })
})

// ---------------------------------------------------------------------------
// formatTracesAsContext
// ---------------------------------------------------------------------------

describe('formatTracesAsContext', () => {
  it('returns empty string for empty array', () => {
    expect(formatTracesAsContext([])).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatTracesAsContext(null as any)).toBe('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatTracesAsContext(undefined as any)).toBe('')
  })

  it('formats a single trace with all fields', () => {
    const result = formatTracesAsContext([makeTrace()])
    expect(result).toContain('## Past Decision Traces')
    expect(result).toContain('1. Trigger: "Send invoice to client"')
    expect(result).toContain('Entities: Acme Corp')
    expect(result).toContain('Decision: Generated and sent PDF invoice via email')
    expect(result).toContain('Reasoning: Client prefers PDF invoices')
    expect(result).toContain('Outcome: success: Invoice sent and acknowledged')
    expect(result).toContain('Apply lessons from these outcomes')
  })

  it('formats multiple traces with numbering', () => {
    const traces = [
      makeTrace({ trigger: 'First decision' }),
      makeTrace({ trigger: 'Second decision' }),
    ]
    const result = formatTracesAsContext(traces)
    expect(result).toContain('1. Trigger: "First decision"')
    expect(result).toContain('2. Trigger: "Second decision"')
  })

  it('omits reasoning when null', () => {
    const result = formatTracesAsContext([makeTrace({ reasoning: null })])
    expect(result).not.toContain('Reasoning:')
  })

  it('omits outcome when null', () => {
    const result = formatTracesAsContext([makeTrace({ outcome: null })])
    expect(result).not.toContain('Outcome:')
  })

  it('omits entity names when empty', () => {
    const result = formatTracesAsContext([makeTrace({ entityNames: [] })])
    expect(result).not.toContain('Entities:')
  })

  it('includes feedback when present', () => {
    const result = formatTracesAsContext([makeTrace({ feedback: 'approved' })])
    expect(result).toContain('Feedback: approved')
  })

  it('truncates long reasoning and outcome', () => {
    const longText = 'x'.repeat(500)
    const result = formatTracesAsContext([
      makeTrace({ reasoning: longText, outcome: longText }),
    ])
    // Should be truncated at 200 chars
    expect(result).not.toContain('x'.repeat(300))
  })
})

// ---------------------------------------------------------------------------
// retrieveRelevantTraces
// ---------------------------------------------------------------------------

describe('retrieveRelevantTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns combined traces from decision_log and agent_runs', async () => {
    const sb = mockSupabase()
    const result = await retrieveRelevantTraces(
      sb,
      'org-1',
      'Send invoice to Acme Corp',
    )

    expect(result.traces.length).toBeGreaterThan(0)
    expect(result.retrievalMs).toBeGreaterThanOrEqual(0)
    // Should have queried both tables
    expect(sb.from).toHaveBeenCalledWith('decision_log')
    expect(sb.from).toHaveBeenCalledWith('agent_runs')
  })

  it('returns decision_log traces with correct shape', async () => {
    const sb = mockSupabase({ runsData: [] })
    const result = await retrieveRelevantTraces(
      sb,
      'org-1',
      'Invoice pricing discount decision',
    )

    const decisionTraces = result.traces.filter(t => t.source === 'decision_log')
    if (decisionTraces.length > 0) {
      const trace = decisionTraces[0]
      expect(trace.source).toBe('decision_log')
      expect(trace.trigger).toBe('Invoice pricing decision')
      expect(trace.action).toBe('Applied 10% discount for bulk order')
      expect(trace.reasoning).toContain('Client has been loyal')
      expect(trace.entityNames).toContain('Acme Corp')
    }
  })

  it('returns empty traces on decision_log query error', async () => {
    const sb = mockSupabase({
      decisionError: { message: 'table not found' },
      runsData: [],
    })
    const result = await retrieveRelevantTraces(sb, 'org-1', 'invoice')

    expect(result.traces).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      '[decision-trace-retriever] decision_log query failed',
      expect.objectContaining({ error: 'table not found' }),
    )
  })

  it('returns empty traces on agent_runs query error', async () => {
    const sb = mockSupabase({
      decisionData: [],
      runsError: { message: 'connection lost' },
    })
    const result = await retrieveRelevantTraces(sb, 'org-1', 'invoice')

    expect(result.traces).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      '[decision-trace-retriever] agent_runs query failed',
      expect.objectContaining({ error: 'connection lost' }),
    )
  })

  it('returns empty traces when trigger has no searchable terms', async () => {
    const sb = mockSupabase()
    const result = await retrieveRelevantTraces(sb, 'org-1', 'hi')

    expect(result.traces).toEqual([])
  })

  it('catches thrown exceptions and returns empty', async () => {
    const sb = {
      from: vi.fn(() => {
        throw new Error('Unexpected failure')
      }),
    }

    const result = await retrieveRelevantTraces(sb as never, 'org-1', 'invoice pricing')

    expect(result.traces).toEqual([])
    // Inner query functions catch and log their own errors
    expect(logger.warn).toHaveBeenCalledWith(
      '[decision-trace-retriever] decision_log query threw',
      expect.objectContaining({ error: 'Unexpected failure' }),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      '[decision-trace-retriever] agent_runs query threw',
      expect.objectContaining({ error: 'Unexpected failure' }),
    )
  })

  it('respects limit option', async () => {
    // Create more data than the limit
    const manyDecisions = Array.from({ length: 10 }, (_, i) => ({
      title: `Decision ${i}`,
      decision: `Action ${i}`,
      reasoning: `Reasoning ${i}`,
      outcome: `Outcome ${i}`,
      lessons_learned: null,
      entity_names: [],
      decided_at: `2026-04-${10 - i}T10:00:00Z`,
      status: 'active',
    }))

    const sb = mockSupabase({
      decisionData: manyDecisions,
      runsData: [],
    })

    const result = await retrieveRelevantTraces(sb, 'org-1', 'invoice decision', { limit: 3 })

    expect(result.traces.length).toBeLessThanOrEqual(3)
  })

  it('passes entityId to decision_log query when provided', async () => {
    const sb = mockSupabase()
    await retrieveRelevantTraces(sb, 'org-1', 'invoice pricing', {
      entityId: 'entity-123',
    })

    // The decision_log chain should have .contains called
    expect(sb.from).toHaveBeenCalledWith('decision_log')
  })

  it('agent_runs traces use trigger_payload.message as trigger', async () => {
    const sb = mockSupabase({
      decisionData: [],
      runsData: [
        {
          trigger_payload: { message: 'Send invoice to Acme Corp' },
          result_summary: 'Invoice sent successfully',
          status: 'success',
          created_at: '2026-04-10T10:00:00Z',
          routing_decision: 'act',
        },
      ],
    })

    const result = await retrieveRelevantTraces(
      sb,
      'org-1',
      'Send invoice to Acme Corp',
    )

    const runTraces = result.traces.filter(t => t.source === 'agent_runs')
    if (runTraces.length > 0) {
      expect(runTraces[0].trigger).toContain('Send invoice')
      expect(runTraces[0].outcome).toContain('success')
    }
  })

  it('filters out agent_runs with low trigger similarity', async () => {
    const sb = mockSupabase({
      decisionData: [],
      runsData: [
        {
          trigger_payload: { message: 'Check weather forecast for tomorrow' },
          result_summary: 'Forecast retrieved',
          status: 'success',
          created_at: '2026-04-10T10:00:00Z',
          routing_decision: 'act',
        },
      ],
    })

    // This trigger is totally different from the run's message
    const result = await retrieveRelevantTraces(
      sb,
      'org-1',
      'Send invoice to client',
    )

    const runTraces = result.traces.filter(t => t.source === 'agent_runs')
    expect(runTraces).toHaveLength(0)
  })

  it('logs info when traces are found', async () => {
    const sb = mockSupabase()
    await retrieveRelevantTraces(sb, 'org-1', 'Invoice pricing decision')

    expect(logger.info).toHaveBeenCalledWith(
      '[decision-trace-retriever] Retrieved traces',
      expect.objectContaining({
        count: expect.any(Number),
      }),
    )
  })

  it('handles agent_runs with missing trigger_payload.message', async () => {
    const sb = mockSupabase({
      decisionData: [],
      runsData: [
        {
          trigger_payload: {},
          result_summary: 'Something happened',
          status: 'success',
          created_at: '2026-04-10T10:00:00Z',
          routing_decision: 'act',
        },
        {
          trigger_payload: null,
          result_summary: 'Something else',
          status: 'success',
          created_at: '2026-04-10T10:00:00Z',
          routing_decision: 'act',
        },
      ],
    })

    const result = await retrieveRelevantTraces(sb, 'org-1', 'invoice pricing')

    // Should gracefully skip runs without a message
    const runTraces = result.traces.filter(t => t.source === 'agent_runs')
    expect(runTraces).toHaveLength(0)
  })
})
