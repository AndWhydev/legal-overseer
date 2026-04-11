import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldRetry, getRetryDelay, enqueueRetry, sendToDeadLetter } from './retry-engine'
import type { ExecutionTask } from './types'

vi.mock('./fsm', () => ({
  calculateRetryDelay: vi.fn((retryCount: number, strategy: string, baseDelayMs: number, maxDelayMs: number) => {
    if (strategy === 'fixed') return Math.min(baseDelayMs, maxDelayMs)
    const exp = baseDelayMs * Math.pow(2, retryCount)
    return Math.min(exp, maxDelayMs)
  }),
}))

vi.mock('@/lib/agent/dlq', () => ({
  writeToDeadLetterQueue: vi.fn().mockResolvedValue(undefined),
}))

function makeTask(overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id: 'task-1',
    org_id: 'org-1',
    thread_id: null,
    task_type: 'standard',
    task_name: 'Test Task',
    task_payload: {},
    status: 'failed',
    priority: 5,
    current_step: 0,
    total_steps: null,
    progress_pct: 0,
    progress_message: '',
    result: null,
    error_message: 'something went wrong',
    error_stack: null,
    retry_count: 0,
    max_retries: 3,
    retry_policy: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 },
    worker_id: 'worker-1',
    heartbeat_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    cancelled_by: null,
    partial_result: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('shouldRetry', () => {
  it('returns true when retry_count < max_retries and status is failed', () => {
    expect(shouldRetry(makeTask({ retry_count: 0, max_retries: 3, status: 'failed' }))).toBe(true)
  })

  it('returns true when retry_count is one less than max_retries', () => {
    expect(shouldRetry(makeTask({ retry_count: 2, max_retries: 3, status: 'failed' }))).toBe(true)
  })

  it('returns false when retry_count equals max_retries', () => {
    expect(shouldRetry(makeTask({ retry_count: 3, max_retries: 3, status: 'failed' }))).toBe(false)
  })

  it('returns false when retry_count exceeds max_retries', () => {
    expect(shouldRetry(makeTask({ retry_count: 5, max_retries: 3, status: 'failed' }))).toBe(false)
  })

  it('returns false when status is not failed', () => {
    expect(shouldRetry(makeTask({ retry_count: 0, max_retries: 3, status: 'completed' }))).toBe(false)
    expect(shouldRetry(makeTask({ retry_count: 0, max_retries: 3, status: 'cancelled' }))).toBe(false)
    expect(shouldRetry(makeTask({ retry_count: 0, max_retries: 3, status: 'working' }))).toBe(false)
  })

  it('returns false when max_retries is 0', () => {
    expect(shouldRetry(makeTask({ retry_count: 0, max_retries: 0, status: 'failed' }))).toBe(false)
  })
})

describe('getRetryDelay', () => {
  it('returns exponential delay for default policy', () => {
    const task = makeTask({ retry_count: 0, retry_policy: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 } })
    const delay = getRetryDelay(task)
    expect(delay).toBe(1000) // 1000 * 2^0 = 1000
  })

  it('doubles delay on each retry', () => {
    const task1 = makeTask({ retry_count: 1, retry_policy: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 } })
    const task2 = makeTask({ retry_count: 2, retry_policy: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 } })
    expect(getRetryDelay(task1)).toBe(2000)
    expect(getRetryDelay(task2)).toBe(4000)
  })

  it('caps delay at max_delay_ms', () => {
    const task = makeTask({ retry_count: 10, retry_policy: { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 5000 } })
    expect(getRetryDelay(task)).toBe(5000)
  })

  it('returns fixed delay for fixed strategy', () => {
    const task = makeTask({ retry_count: 5, retry_policy: { strategy: 'fixed', base_delay_ms: 2000, max_delay_ms: 30000 } })
    expect(getRetryDelay(task)).toBe(2000)
  })
})

describe('enqueueRetry', () => {
  function makeEqChain(resolved: unknown) {
    const single = vi.fn().mockResolvedValue(resolved)
    const select = vi.fn().mockReturnValue({ single })
    const eq2 = vi.fn().mockReturnValue({ select })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    return { update, eq1, eq2, select, single }
  }

  it('transitions failed->pending and sets the provided retry count', async () => {
    const { update } = makeEqChain({ data: { id: 'task-1', status: 'pending', retry_count: 1 }, error: null })
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as Parameters<typeof enqueueRetry>[0]

    const result = await enqueueRetry(supabase, 'task-1', 1)

    expect(supabase.from).toHaveBeenCalledWith('execution_tasks')
    expect(result).not.toBeNull()
    expect(result?.status).toBe('pending')
  })

  it('returns null when optimistic concurrency check fails (status already changed)', async () => {
    const { update } = makeEqChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } })
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as Parameters<typeof enqueueRetry>[0]

    const result = await enqueueRetry(supabase, 'task-1', 1)
    expect(result).toBeNull()
  })
})

describe('sendToDeadLetter', () => {
  it('calls writeToDeadLetterQueue with task metadata', async () => {
    const { writeToDeadLetterQueue } = await import('@/lib/agent/dlq')
    const task = makeTask({ id: 'task-dlq', task_name: 'My Task', retry_count: 3, error_message: 'terminal error' })
    const supabase = {} as Parameters<typeof sendToDeadLetter>[0]

    await sendToDeadLetter(supabase, task)

    expect(writeToDeadLetterQueue).toHaveBeenCalledWith(supabase, expect.objectContaining({
      agentType: 'execution_task',
      errorMessage: 'terminal error',
    }))
  })
})
