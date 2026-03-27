/**
 * Cron Resilience Utilities Tests
 *
 * Tests for withRetry, withBackoff, and processBatch utilities
 * that handle the 4 cron failure modes:
 * - DB connection failure (retry + DLQ)
 * - LLM timeout (circuit breaker)
 * - Rate limits (backoff)
 * - Partial batch failure (continue processing)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoist mocks
const { getCircuitStateMock, deadLetterMock } = vi.hoisted(() => ({
  getCircuitStateMock: vi.fn(),
  deadLetterMock: vi.fn(),
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  getCircuitState: getCircuitStateMock,
}))

vi.mock('@/lib/agent/dead-letter', () => ({
  deadLetter: deadLetterMock,
}))

// Suppress console output during tests
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getCircuitStateMock.mockReturnValue('closed')
  deadLetterMock.mockResolvedValue({ id: 'dlq-1' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('withRetry', () => {
  it('retries a failing async fn up to maxRetries times, then throws', async () => {
    const { withRetry } = await import('./cron-resilience')
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('connection refused'))

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, label: 'test-retry' })
    ).rejects.toThrow('connection refused')

    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('succeeds on second attempt if fn recovers', async () => {
    const { withRetry } = await import('./cron-resilience')
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, label: 'test-recover' })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('applies exponential backoff (delays double each retry)', async () => {
    const { withRetry } = await import('./cron-resilience')
    const delays: number[] = []
    const originalSetTimeout = globalThis.setTimeout

    // Track delay values via a spy on the internal sleep
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler, ms?: number) => {
      if (ms && ms > 0) delays.push(ms)
      if (typeof fn === 'function') fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const failFn = vi.fn()
      .mockRejectedValueOnce(new Error('connection error'))
      .mockRejectedValueOnce(new Error('connection error'))
      .mockRejectedValueOnce(new Error('connection error'))

    await expect(
      withRetry(failFn, { maxRetries: 2, baseDelayMs: 100, label: 'test-backoff' })
    ).rejects.toThrow('connection error')

    // Should have 2 delays: baseDelayMs * 2^0 = 100, baseDelayMs * 2^1 = 200
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBe(100)
    expect(delays[1]).toBe(200)
  })

  it('does not retry non-retryable errors (non-connection/timeout)', async () => {
    const { withRetry } = await import('./cron-resilience')
    const fn = vi.fn().mockRejectedValueOnce(new Error('validation failed'))

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, label: 'test-non-retryable' })
    ).rejects.toThrow('validation failed')

    // Only called once -- not retried because it's not a transient error
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('withBackoff', () => {
  it('detects rate limit errors (429 status) and waits then retries', async () => {
    const { withBackoff } = await import('./cron-resilience')

    // Suppress actual sleep
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { status: 429 })

    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce('ok after backoff')

    const result = await withBackoff(fn, { label: 'test-429' })
    expect(result).toBe('ok after backoff')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('detects rate limit from message containing "rate limit"', async () => {
    const { withBackoff } = await import('./cron-resilience')

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate Limit exceeded, try again later'))
      .mockResolvedValueOnce('recovered')

    const result = await withBackoff(fn, { label: 'test-rate-msg' })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('passes through non-rate-limit errors without retry', async () => {
    const { withBackoff } = await import('./cron-resilience')

    const fn = vi.fn().mockRejectedValueOnce(new Error('internal server error'))

    await expect(
      withBackoff(fn, { label: 'test-passthrough' })
    ).rejects.toThrow('internal server error')

    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('processBatch', () => {
  it('continues processing after individual item failure', async () => {
    const { processBatch } = await import('./cron-resilience')

    const processor = vi.fn()
      .mockResolvedValueOnce('result-1')
      .mockRejectedValueOnce(new Error('item 2 failed'))
      .mockResolvedValueOnce('result-3')

    const result = await processBatch(
      ['a', 'b', 'c'],
      processor,
      { label: 'test-partial' }
    )

    expect(result.results).toEqual(['result-1', 'result-3'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].item).toBe('b')
    expect(result.errors[0].error).toBe('item 2 failed')
  })

  it('collects all errors and returns them alongside successes', async () => {
    const { processBatch } = await import('./cron-resilience')

    const processor = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockResolvedValueOnce('ok-2')
      .mockRejectedValueOnce(new Error('fail-3'))
      .mockResolvedValueOnce('ok-4')

    const result = await processBatch(
      [1, 2, 3, 4],
      processor,
      { label: 'test-collect-errors' }
    )

    expect(result.results).toEqual(['ok-2', 'ok-4'])
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].item).toBe(1)
    expect(result.errors[0].error).toBe('fail-1')
    expect(result.errors[1].item).toBe(3)
    expect(result.errors[1].error).toBe('fail-3')
  })

  it('dead-letters items that fail when supabase client is provided', async () => {
    const { processBatch } = await import('./cron-resilience')

    const mockSupabase = {} as any

    const processor = vi.fn()
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('permanent failure'))

    const result = await processBatch(
      ['item-1', 'item-2'],
      processor,
      {
        label: 'test-dlq',
        supabase: mockSupabase,
        orgId: 'org-123',
      }
    )

    expect(result.results).toEqual(['ok'])
    expect(result.errors).toHaveLength(1)

    // deadLetter should have been called for the failed item
    expect(deadLetterMock).toHaveBeenCalledTimes(1)
    expect(deadLetterMock).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      agent_type: 'test-dlq',
      org_id: 'org-123',
      error_message: 'permanent failure',
      payload: { item: 'item-2' },
    }))
  })

  it('respects circuit breaker state -- skips remaining items when circuit is open', async () => {
    const { processBatch } = await import('./cron-resilience')

    // Circuit starts closed, then opens for remaining items
    getCircuitStateMock
      .mockReturnValueOnce('closed')
      .mockReturnValue('open')

    const processor = vi.fn().mockResolvedValue('ok')

    const result = await processBatch(
      ['a', 'b', 'c'],
      processor,
      { label: 'test-circuit', circuitKey: 'llm' }
    )

    // Only first item should be processed -- rest skipped because circuit opened
    expect(processor).toHaveBeenCalledTimes(1)
    expect(result.results).toEqual(['ok'])
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].error).toContain('circuit')
    expect(result.errors[1].error).toContain('circuit')
  })

  it('processes all items when circuit stays closed', async () => {
    const { processBatch } = await import('./cron-resilience')

    getCircuitStateMock.mockReturnValue('closed')

    const processor = vi.fn().mockResolvedValue('ok')

    const result = await processBatch(
      ['a', 'b', 'c'],
      processor,
      { label: 'test-circuit-ok', circuitKey: 'llm' }
    )

    expect(processor).toHaveBeenCalledTimes(3)
    expect(result.results).toEqual(['ok', 'ok', 'ok'])
    expect(result.errors).toHaveLength(0)
  })
})
