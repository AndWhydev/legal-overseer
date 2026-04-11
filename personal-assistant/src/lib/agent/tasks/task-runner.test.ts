import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runTask, registerTaskExecutor, getTaskExecutor, type TaskExecutor } from './task-runner'
import type { ExecutionTask } from './types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./task-service', () => ({
  claimTask: vi.fn(),
  startTask: vi.fn(),
  completeTask: vi.fn(),
  failTask: vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue(undefined),
  updateProgress: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./step-tracker', () => ({
  startStep: vi.fn().mockResolvedValue(null),
  completeStep: vi.fn().mockResolvedValue(null),
  failStep: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id: 'task-1',
    org_id: 'org-1',
    thread_id: null,
    task_type: 'standard',
    task_name: 'Test Task',
    task_payload: {},
    status: 'working',
    priority: 1,
    current_step: 0,
    total_steps: null,
    progress_pct: 0,
    progress_message: '',
    result: null,
    error_message: null,
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

function makeSupabase() {
  return {} as Parameters<typeof runTask>[0]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerTaskExecutor / getTaskExecutor', () => {
  it('registers and retrieves an executor', () => {
    const executor: TaskExecutor = { execute: vi.fn().mockResolvedValue({}) }
    registerTaskExecutor('test_type', executor)
    expect(getTaskExecutor('test_type')).toBe(executor)
  })

  it('returns undefined for unregistered type', () => {
    expect(getTaskExecutor('nonexistent_type_xyz')).toBeUndefined()
  })
})

describe('runTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('happy path: claim -> start -> execute -> complete', async () => {
    const { claimTask, startTask, completeTask } = await import('./task-service')
    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(completeTask).mockResolvedValue(task)

    const expectedResult = { summary: 'done' }
    const executor: TaskExecutor = { execute: vi.fn().mockResolvedValue(expectedResult) }
    registerTaskExecutor('standard', executor)

    const supabase = makeSupabase()
    const promise = runTask(supabase, 'task-1', 'worker-1')
    const result = await promise

    expect(result).toEqual({ success: true })
    expect(claimTask).toHaveBeenCalledWith(supabase, 'task-1', 'worker-1')
    expect(startTask).toHaveBeenCalledWith(supabase, 'task-1')
    expect(executor.execute).toHaveBeenCalledWith(task, expect.objectContaining({
      supabase,
      signal: expect.any(AbortSignal),
      updateProgress: expect.any(Function),
      startStep: expect.any(Function),
      completeStep: expect.any(Function),
      failStep: expect.any(Function),
    }))
    expect(completeTask).toHaveBeenCalledWith(supabase, 'task-1', expectedResult)
  })

  it('returns failure when claimTask returns null', async () => {
    const { claimTask } = await import('./task-service')
    vi.mocked(claimTask).mockResolvedValue(null)

    const result = await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/claim/i)
  })

  it('returns failure when startTask returns null', async () => {
    const { claimTask, startTask } = await import('./task-service')
    vi.mocked(claimTask).mockResolvedValue(makeTask())
    vi.mocked(startTask).mockResolvedValue(null)

    const result = await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/start/i)
  })

  it('fails the task when no executor is registered for the task_type', async () => {
    const { claimTask, startTask, failTask } = await import('./task-service')
    const task = makeTask({ task_type: 'cua_browser' })
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(failTask).mockResolvedValue({ task, retrying: false })

    // Ensure no executor for cua_browser
    const existingExecutor = getTaskExecutor('cua_browser')
    if (existingExecutor) {
      // Override with no-op to simulate missing (test isolation)
    }

    // Remove cua_browser executor by importing registry and deleting
    // Instead, confirm we get the error path by using an unregistered type
    const unregisteredTask = makeTask({ task_type: 'workspace_compute' })
    vi.mocked(claimTask).mockResolvedValue(unregisteredTask)
    vi.mocked(startTask).mockResolvedValue(unregisteredTask)

    const result = await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No executor/i)
    expect(failTask).toHaveBeenCalledWith(
      expect.anything(),
      'task-1',
      expect.objectContaining({ message: expect.stringContaining('workspace_compute') }),
    )
  })

  it('calls failTask and returns error when executor throws', async () => {
    const { claimTask, startTask, failTask } = await import('./task-service')
    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(failTask).mockResolvedValue({ task, retrying: false })

    const executor: TaskExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('executor exploded')),
    }
    registerTaskExecutor('standard', executor)

    const result = await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('executor exploded')
    expect(failTask).toHaveBeenCalledWith(
      expect.anything(),
      'task-1',
      expect.objectContaining({ message: 'executor exploded' }),
    )
  })

  it('logs retry info when failTask returns retrying=true', async () => {
    const { claimTask, startTask, failTask } = await import('./task-service')
    const { logger } = await import('@/lib/core/logger')
    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(failTask).mockResolvedValue({ task: { ...task, retry_count: 1 }, retrying: true })

    const executor: TaskExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('transient error')),
    }
    registerTaskExecutor('standard', executor)

    await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(logger.info).toHaveBeenCalledWith(
      '[task-runner] Task will retry',
      expect.objectContaining({ taskId: 'task-1', retryCount: 1 }),
    )
  })

  it('clears heartbeat interval on success', async () => {
    const { claimTask, startTask, completeTask } = await import('./task-service')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(completeTask).mockResolvedValue(task)

    const executor: TaskExecutor = { execute: vi.fn().mockResolvedValue({}) }
    registerTaskExecutor('standard', executor)

    await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('clears heartbeat interval on failure', async () => {
    const { claimTask, startTask, failTask } = await import('./task-service')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(failTask).mockResolvedValue({ task, retrying: false })

    const executor: TaskExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    }
    registerTaskExecutor('standard', executor)

    await runTask(makeSupabase(), 'task-1', 'worker-1')

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('heartbeat interval fires every 15 seconds', async () => {
    const { claimTask, startTask, completeTask, sendHeartbeat } = await import('./task-service')

    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(completeTask).mockResolvedValue(task)

    // Executor takes "a while" — we resolve it manually
    let resolveExecutor!: (value: Record<string, unknown>) => void
    const executorPromise = new Promise<Record<string, unknown>>((res) => {
      resolveExecutor = res
    })

    const executor: TaskExecutor = { execute: vi.fn().mockReturnValue(executorPromise) }
    registerTaskExecutor('standard', executor)

    const supabase = makeSupabase()
    const runPromise = runTask(supabase, 'task-1', 'worker-1')

    // Advance 45 seconds — heartbeat should have fired at 15s and 30s
    await vi.advanceTimersByTimeAsync(45_000)
    expect(sendHeartbeat).toHaveBeenCalledWith(supabase, 'task-1')
    expect(vi.mocked(sendHeartbeat).mock.calls.length).toBeGreaterThanOrEqual(2)

    resolveExecutor({})
    await runPromise
  })

  it('execution context provides working step helpers', async () => {
    const { claimTask, startTask, completeTask } = await import('./task-service')
    const stepTracker = await import('./step-tracker')

    const task = makeTask()
    vi.mocked(claimTask).mockResolvedValue(task)
    vi.mocked(startTask).mockResolvedValue(task)
    vi.mocked(completeTask).mockResolvedValue(task)

    let capturedContext: Parameters<TaskExecutor['execute']>[1] | null = null
    const executor: TaskExecutor = {
      execute: vi.fn().mockImplementation(async (_task, ctx) => {
        capturedContext = ctx
        return {}
      }),
    }
    registerTaskExecutor('standard', executor)

    await runTask(makeSupabase(), 'task-1', 'worker-1')

    // Verify context helpers delegate to step-tracker
    await capturedContext!.startStep(1)
    expect(stepTracker.startStep).toHaveBeenCalledWith(expect.anything(), 'task-1', 1)

    await capturedContext!.completeStep(1, { result: 'ok' })
    expect(stepTracker.completeStep).toHaveBeenCalledWith(expect.anything(), 'task-1', 1, { result: 'ok' })

    await capturedContext!.failStep(1, 'step failed')
    expect(stepTracker.failStep).toHaveBeenCalledWith(expect.anything(), 'task-1', 1, 'step failed')
  })
})
