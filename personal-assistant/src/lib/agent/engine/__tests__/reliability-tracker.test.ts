/**
 * Reliability Tracker Tests
 *
 * Tests inferServiceName, formatReliabilityContext, recordExecution,
 * and getReliabilitySummary in isolation with mocked Supabase.
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
  inferServiceName,
  formatReliabilityContext,
  recordExecution,
  getReliabilitySummary,
  type ReliabilitySummary,
  type ExecutionRecord,
} from '../reliability-tracker'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase(overrides?: {
  insertError?: { message: string }
  selectData?: unknown[]
  selectError?: { message: string }
}) {
  const insertFn = vi.fn().mockReturnValue({
    error: overrides?.insertError ?? null,
  })

  const eqFn = vi.fn().mockReturnValue({
    data: overrides?.selectData ?? [],
    error: overrides?.selectError ?? null,
  })

  const selectFn = vi.fn().mockReturnValue({
    eq: eqFn,
  })

  return {
    from: vi.fn((table: string) => {
      if (table === 'execution_reliability') {
        return { insert: insertFn }
      }
      if (table === 'execution_reliability_summary') {
        return { select: selectFn }
      }
      return {}
    }),
    _insertFn: insertFn,
    _selectFn: selectFn,
    _eqFn: eqFn,
  } as unknown as ReturnType<typeof mockSupabase> & {
    _insertFn: typeof insertFn
    _selectFn: typeof selectFn
    _eqFn: typeof eqFn
  }
}

function makeSummary(overrides?: Partial<ReliabilitySummary>): ReliabilitySummary {
  return {
    org_id: 'org-1',
    service_name: 'gmail',
    tier: 'api',
    total_executions: 100,
    success_rate: 0.95,
    avg_latency_ms: 230,
    avg_cost_cents: 0.5,
    most_common_error: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// inferServiceName
// ---------------------------------------------------------------------------

describe('inferServiceName', () => {
  it('maps send_gmail to "gmail"', () => {
    expect(inferServiceName('send_gmail')).toBe('gmail')
  })

  it('maps send_email to "gmail"', () => {
    expect(inferServiceName('send_email')).toBe('gmail')
  })

  it('maps send_outlook to "outlook"', () => {
    expect(inferServiceName('send_outlook')).toBe('outlook')
  })

  it('extracts domain from spawn_browser_agent input.url', () => {
    const result = inferServiceName('spawn_browser_agent', {
      url: 'https://www.example.com/path?q=1',
    })
    expect(result).toBe('example.com')
  })

  it('strips www. prefix from browser URL domain', () => {
    const result = inferServiceName('spawn_browser_agent', {
      url: 'https://www.google.com/search',
    })
    expect(result).toBe('google.com')
  })

  it('returns "browser_unknown" when spawn_browser_agent has no url', () => {
    expect(inferServiceName('spawn_browser_agent', {})).toBe('browser_unknown')
    expect(inferServiceName('spawn_browser_agent')).toBe('browser_unknown')
  })

  it('returns "browser_unknown" when spawn_browser_agent has invalid url', () => {
    expect(inferServiceName('spawn_browser_agent', { url: 'not-a-url' })).toBe('browser_unknown')
  })

  it('maps spawn_ephemeral_workspace to "workspace"', () => {
    expect(inferServiceName('spawn_ephemeral_workspace')).toBe('workspace')
  })

  it('returns tool name as-is for unknown tools', () => {
    expect(inferServiceName('search_contacts')).toBe('search_contacts')
    expect(inferServiceName('create_task')).toBe('create_task')
  })
})

// ---------------------------------------------------------------------------
// formatReliabilityContext
// ---------------------------------------------------------------------------

describe('formatReliabilityContext', () => {
  it('returns empty string for empty array', () => {
    expect(formatReliabilityContext([])).toBe('')
  })

  it('returns empty string for null/undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatReliabilityContext(null as any)).toBe('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatReliabilityContext(undefined as any)).toBe('')
  })

  it('produces a markdown table for a single entry', () => {
    const result = formatReliabilityContext([makeSummary()])
    expect(result).toContain('## Tool Reliability (7-day)')
    expect(result).toContain('| Service | Tier |')
    expect(result).toContain('| gmail | api | 95.0% | 230ms | $0.5 | - |')
  })

  it('produces rows for multiple entries', () => {
    const summaries = [
      makeSummary({ service_name: 'gmail', success_rate: 0.95 }),
      makeSummary({
        service_name: 'outlook',
        tier: 'api',
        success_rate: 0.8,
        avg_latency_ms: 450,
        avg_cost_cents: 1.2,
        most_common_error: 'rate_limit',
      }),
    ]
    const result = formatReliabilityContext(summaries)
    expect(result).toContain('| gmail | api | 95.0%')
    expect(result).toContain('| outlook | api | 80.0% | 450ms | $1.2 | rate_limit |')
  })

  it('shows dashes for null latency and cost', () => {
    const result = formatReliabilityContext([
      makeSummary({ avg_latency_ms: null, avg_cost_cents: null }),
    ])
    expect(result).toContain('| - | - |')
  })
})

// ---------------------------------------------------------------------------
// recordExecution
// ---------------------------------------------------------------------------

describe('recordExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a record successfully', async () => {
    const sb = mockSupabase()
    const record: ExecutionRecord = {
      org_id: 'org-1',
      service_name: 'gmail',
      tier: 'api',
      success: true,
      latency_ms: 200,
      tool_name: 'send_gmail',
    }

    await recordExecution(sb as never, record)

    expect(sb.from).toHaveBeenCalledWith('execution_reliability')
    expect((sb as unknown as { _insertFn: ReturnType<typeof vi.fn> })._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        service_name: 'gmail',
        tier: 'api',
        success: true,
        latency_ms: 200,
        tool_name: 'send_gmail',
      }),
    )
  })

  it('logs warning on insert error but does not throw', async () => {
    const sb = mockSupabase({ insertError: { message: 'DB connection lost' } })
    const record: ExecutionRecord = {
      org_id: 'org-1',
      service_name: 'gmail',
      tier: 'api',
      success: false,
    }

    // Should not throw
    await expect(recordExecution(sb as never, record)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[reliability-tracker] Failed to record execution',
      expect.objectContaining({ error: 'DB connection lost' }),
    )
  })

  it('catches thrown exceptions and logs without rethrowing', async () => {
    const sb = {
      from: vi.fn(() => {
        throw new Error('Unexpected failure')
      }),
    }

    await expect(recordExecution(sb as never, {
      org_id: 'org-1',
      service_name: 'gmail',
      tier: 'api',
      success: false,
    })).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[reliability-tracker] Failed to record execution',
      expect.objectContaining({ error: 'Unexpected failure' }),
    )
  })
})

// ---------------------------------------------------------------------------
// getReliabilitySummary
// ---------------------------------------------------------------------------

describe('getReliabilitySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed data on success', async () => {
    const summaries = [makeSummary(), makeSummary({ service_name: 'outlook' })]
    const sb = mockSupabase({ selectData: summaries })

    const result = await getReliabilitySummary(sb as never, 'org-1')

    expect(result).toHaveLength(2)
    expect(result[0].service_name).toBe('gmail')
    expect(result[1].service_name).toBe('outlook')
  })

  it('returns empty array on query error', async () => {
    const sb = mockSupabase({ selectError: { message: 'table not found' } })

    const result = await getReliabilitySummary(sb as never, 'org-1')

    expect(result).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      '[reliability-tracker] Failed to query summary',
      expect.objectContaining({ error: 'table not found' }),
    )
  })

  it('returns empty array on thrown exception', async () => {
    const sb = {
      from: vi.fn(() => {
        throw new Error('Connection refused')
      }),
    }

    const result = await getReliabilitySummary(sb as never, 'org-1')

    expect(result).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      '[reliability-tracker] Failed to query summary',
      expect.objectContaining({ error: 'Connection refused' }),
    )
  })
})
