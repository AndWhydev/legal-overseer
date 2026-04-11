import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectAndRecoverOrphans } from './heartbeat-monitor'

vi.mock('./retry-engine', () => ({
  shouldRetry: vi.fn(),
  enqueueRetry: vi.fn().mockResolvedValue({ id: 'task-1', status: 'pending' }),
  sendToDeadLetter: vi.fn().mockResolvedValue(undefined),
}))

function makeSupabaseMock(tasks: object[]) {
  const singleMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) }),
    }),
  })
  const selectResult = { data: tasks, error: null }

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'execution_tasks') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue(selectResult),
            }),
          }),
          update: updateMock,
        }
      }
      return {}
    }),
    _updateMock: updateMock,
    _singleMock: singleMock,
  }
}

describe('detectAndRecoverOrphans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zero counts when no orphans found', async () => {
    const supabase = makeSupabaseMock([])
    const { shouldRetry } = await import('./retry-engine')
    vi.mocked(shouldRetry).mockReturnValue(false)

    const result = await detectAndRecoverOrphans(supabase as unknown as Parameters<typeof detectAndRecoverOrphans>[0])

    expect(result).toEqual({ recovered: 0, deadLettered: 0 })
  })

  it('enqueues retry for retryable orphaned tasks', async () => {
    const orphanTask = {
      id: 'task-orphan',
      status: 'working',
      retry_count: 0,
      max_retries: 3,
      error_message: null,
    }
    const { shouldRetry, enqueueRetry } = await import('./retry-engine')
    vi.mocked(shouldRetry).mockReturnValue(true)

    const updateEq = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: { id: 'task-orphan', status: 'failed' }, error: null }),
    })
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [orphanTask], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      })),
    }

    const result = await detectAndRecoverOrphans(supabase as unknown as Parameters<typeof detectAndRecoverOrphans>[0])

    expect(result.recovered).toBe(1)
    expect(result.deadLettered).toBe(0)
    expect(enqueueRetry).toHaveBeenCalledWith(supabase, 'task-orphan', 1)
  })

  it('sends to dead letter for non-retryable orphaned tasks', async () => {
    const orphanTask = {
      id: 'task-dead',
      status: 'claimed',
      retry_count: 3,
      max_retries: 3,
      error_message: null,
    }
    const { shouldRetry, sendToDeadLetter } = await import('./retry-engine')
    vi.mocked(shouldRetry).mockReturnValue(false)

    const updateEq = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: { id: 'task-dead', status: 'failed' }, error: null }),
    })
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [orphanTask], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      })),
    }

    const result = await detectAndRecoverOrphans(supabase as unknown as Parameters<typeof detectAndRecoverOrphans>[0])

    expect(result.recovered).toBe(0)
    expect(result.deadLettered).toBe(1)
    expect(sendToDeadLetter).toHaveBeenCalled()
  })

  it('uses default stale threshold of 90 seconds', async () => {
    const { shouldRetry } = await import('./retry-engine')
    vi.mocked(shouldRetry).mockReturnValue(false)

    const ltMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({ lt: ltMock }),
        }),
        update: vi.fn(),
      }),
    }

    await detectAndRecoverOrphans(supabase as unknown as Parameters<typeof detectAndRecoverOrphans>[0])

    expect(ltMock).toHaveBeenCalledWith('heartbeat_at', expect.any(String))
    // Verify threshold is approximately 90 seconds ago
    const calledAt = new Date(ltMock.mock.calls[0][1]).getTime()
    const now = Date.now()
    const diffMs = now - calledAt
    expect(diffMs).toBeGreaterThanOrEqual(89000)
    expect(diffMs).toBeLessThan(95000)
  })

  it('respects custom stale threshold', async () => {
    const { shouldRetry } = await import('./retry-engine')
    vi.mocked(shouldRetry).mockReturnValue(false)

    const ltMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({ lt: ltMock }),
        }),
        update: vi.fn(),
      }),
    }

    await detectAndRecoverOrphans(supabase as unknown as Parameters<typeof detectAndRecoverOrphans>[0], { staleThresholdMs: 60000 })

    const calledAt = new Date(ltMock.mock.calls[0][1]).getTime()
    const now = Date.now()
    const diffMs = now - calledAt
    expect(diffMs).toBeGreaterThanOrEqual(59000)
    expect(diffMs).toBeLessThan(65000)
  })
})
