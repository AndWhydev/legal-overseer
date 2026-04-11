import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cancelTask,
  claimTask,
  completeTask,
  createTask,
  failTask,
  getActiveTasks,
  getTask,
  getTaskWithSteps,
  getTasksByThread,
  pauseTask,
  resumeTask,
  sendHeartbeat,
  startTask,
  updateProgress,
} from '../task-service'

vi.mock('@/lib/agent/dlq', () => ({
  writeToDeadLetterQueue: vi.fn().mockResolvedValue(undefined),
}))

const makeTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'task-123',
  org_id: 'org-1',
  thread_id: null,
  task_type: 'standard',
  task_name: 'Test Task',
  task_payload: {},
  status: 'pending',
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
  worker_id: null,
  heartbeat_at: null,
  claimed_at: null,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  partial_result: null,
  created_at: '2026-04-09T00:00:00Z',
  updated_at: '2026-04-09T00:00:00Z',
  ...overrides,
})

function buildMockSupabase(taskData: Record<string, unknown> | null = makeTask(), stepsData: unknown[] = []) {
  const singleMock = vi.fn().mockResolvedValue({ data: taskData, error: null })
  const eqMock: ReturnType<typeof vi.fn> = vi.fn().mockReturnThis()

  const queryChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: eqMock,
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: singleMock,
  }

  const fromMock = vi.fn((table: string) => {
    if (table === 'execution_steps') {
      return {
        ...queryChain,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        // steps query returns array
        order: vi.fn().mockResolvedValue({ data: stepsData, error: null }),
        insert: vi.fn().mockResolvedValue({ data: stepsData, error: null }),
      }
    }
    return queryChain
  })

  return { from: fromMock } as unknown as SupabaseClient
}

describe('createTask', () => {
  it('inserts a task row and returns the created task', async () => {
    const task = makeTask()
    const supabase = buildMockSupabase(task)
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: task, error: null }),
    }))

    const result = await createTask(supabase, {
      org_id: 'org-1',
      task_type: 'standard',
      task_name: 'Test Task',
    })

    expect(result.id).toBe('task-123')
    expect(result.status).toBe('pending')
  })

  it('throws if insert fails', async () => {
    const supabase = buildMockSupabase(null)
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }))

    await expect(
      createTask(supabase, { org_id: 'org-1', task_type: 'standard', task_name: 'Test' }),
    ).rejects.toThrow('DB error')
  })
})

describe('claimTask', () => {
  it('updates status to claimed with worker_id using optimistic concurrency', async () => {
    const claimed = makeTask({ status: 'claimed', worker_id: 'worker-1' })
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockReturnThis()
    const singleMock = vi.fn().mockResolvedValue({ data: claimed, error: null })

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: singleMock,
      }),
    } as unknown as SupabaseClient

    const result = await claimTask(supabase, 'task-123', 'worker-1')
    expect(result?.status).toBe('claimed')
    expect(result?.worker_id).toBe('worker-1')
    // Verify optimistic concurrency: eq called with status='pending'
    expect(eqMock).toHaveBeenCalledWith('status', 'pending')
  })

  it('returns null when task not found or already claimed', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await claimTask(supabase, 'task-123', 'worker-1')
    expect(result).toBeNull()
  })
})

describe('startTask', () => {
  it('transitions claimed -> working with optimistic concurrency', async () => {
    const working = makeTask({ status: 'working' })
    const eqMock = vi.fn().mockReturnThis()

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: working, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await startTask(supabase, 'task-123')
    expect(result?.status).toBe('working')
    expect(eqMock).toHaveBeenCalledWith('status', 'claimed')
  })
})

describe('updateProgress', () => {
  it('updates progress fields without state transition', async () => {
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
        eq: eqMock,
      }),
    } as unknown as SupabaseClient

    await updateProgress(supabase, 'task-123', {
      current_step: 2,
      progress_pct: 40,
      progress_message: 'Step 2 of 5',
    })

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        current_step: 2,
        progress_pct: 40,
        progress_message: 'Step 2 of 5',
      }),
    )
  })
})

describe('completeTask', () => {
  it('transitions working -> completed and sets result', async () => {
    const completed = makeTask({ status: 'completed', progress_pct: 100 })
    const eqMock = vi.fn().mockReturnThis()

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: completed, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await completeTask(supabase, 'task-123', { output: 'done' })
    expect(result?.status).toBe('completed')
    expect(eqMock).toHaveBeenCalledWith('status', 'working')
  })
})

describe('failTask', () => {
  it('transitions to pending for retry when retry_count < max_retries', async () => {
    const failedTask = makeTask({ status: 'failed', retry_count: 0, max_retries: 3 })
    const eqMock = vi.fn().mockReturnThis()
    const updateMock = vi.fn().mockReturnThis()
    let callCount = 0

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockImplementation(() => {
          callCount++
          return {
            eq: eqMock,
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: callCount === 1 ? failedTask : null,
              error: null,
            }),
          }
        }),
      }),
    } as unknown as SupabaseClient

    const result = await failTask(supabase, 'task-123', { message: 'Network error' })
    expect(result.retrying).toBe(true)
    expect(result.task.status).toBe('failed')
  })

  it('writes to DLQ and does not retry when retry_count >= max_retries', async () => {
    const { writeToDeadLetterQueue } = await import('@/lib/agent/dlq')
    const failedTask = makeTask({ status: 'failed', retry_count: 3, max_retries: 3 })
    const eqMock = vi.fn().mockReturnThis()

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: failedTask, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await failTask(supabase, 'task-123', { message: 'Terminal error' })
    expect(result.retrying).toBe(false)
    expect(writeToDeadLetterQueue).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ errorMessage: 'Terminal error' }),
    )
  })

  it('throws TASK_STATE_CONFLICT if task not in working state', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as SupabaseClient

    await expect(
      failTask(supabase, 'task-123', { message: 'error' }),
    ).rejects.toThrow('TASK_STATE_CONFLICT')
  })
})

describe('cancelTask', () => {
  it('cancels a task in working state', async () => {
    const current = makeTask({ status: 'working' })
    const cancelled = makeTask({ status: 'cancelled' })
    let selectCallCount = 0

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (this: unknown) { return this }),
        single: vi.fn().mockImplementation(() => {
          selectCallCount++
          return Promise.resolve({
            data: selectCallCount === 1 ? current : cancelled,
            error: null,
          })
        }),
      }),
    } as unknown as SupabaseClient

    const result = await cancelTask(supabase, 'task-123', 'user')
    expect(result?.status).toBe('cancelled')
  })

  it('throws TASK_NOT_CANCELLABLE for terminal statuses', async () => {
    const completed = makeTask({ status: 'completed' })

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: completed, error: null }),
      }),
    } as unknown as SupabaseClient

    await expect(cancelTask(supabase, 'task-123', 'user')).rejects.toThrow(
      'TASK_NOT_CANCELLABLE',
    )
  })
})

describe('pauseTask', () => {
  it('transitions working -> paused', async () => {
    const paused = makeTask({ status: 'paused' })
    const eqMock = vi.fn().mockReturnThis()

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: paused, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await pauseTask(supabase, 'task-123')
    expect(result?.status).toBe('paused')
    expect(eqMock).toHaveBeenCalledWith('status', 'working')
  })
})

describe('resumeTask', () => {
  it('transitions paused -> working', async () => {
    const working = makeTask({ status: 'working' })
    const eqMock = vi.fn().mockReturnThis()

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: eqMock,
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: working, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await resumeTask(supabase, 'task-123')
    expect(result?.status).toBe('working')
    expect(eqMock).toHaveBeenCalledWith('status', 'paused')
  })
})

describe('sendHeartbeat', () => {
  it('updates heartbeat_at without throwing', async () => {
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })

    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock, eq: eqMock }),
    } as unknown as SupabaseClient

    await expect(sendHeartbeat(supabase, 'task-123')).resolves.toBeUndefined()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_at: expect.any(String) }),
    )
  })
})

describe('getTask', () => {
  it('returns null for PGRST116 (not found)', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    } as unknown as SupabaseClient

    const result = await getTask(supabase, 'missing-id')
    expect(result).toBeNull()
  })
})

describe('getTasksByThread', () => {
  it('returns tasks filtered by thread_id', async () => {
    const tasks = [makeTask({ thread_id: 'thread-1' })]

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: tasks, error: null }),
      }),
    } as unknown as SupabaseClient

    const result = await getTasksByThread(supabase, 'org-1', 'thread-1')
    expect(result).toHaveLength(1)
    expect(result[0].thread_id).toBe('thread-1')
  })
})

describe('getActiveTasks', () => {
  it('returns tasks in active statuses', async () => {
    const tasks = [makeTask({ status: 'working' }), makeTask({ status: 'pending' })]

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        // second order call returns the data
        // we chain two orders, so mock the chain properly
      }),
    } as unknown as SupabaseClient

    // Use a more flexible mock that resolves on the last call
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(function (this: unknown, _field: string, _opts?: unknown) {
        return {
          order: vi.fn().mockResolvedValue({ data: tasks, error: null }),
        }
      }),
    })

    const result = await getActiveTasks(supabase, 'org-1')
    expect(result).toHaveLength(2)
  })
})

describe('getTaskWithSteps', () => {
  it('returns null when task not found', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    } as unknown as SupabaseClient

    const result = await getTaskWithSteps(supabase, 'missing')
    expect(result).toBeNull()
  })

  it('returns task with steps', async () => {
    const task = makeTask()
    const steps = [
      { id: 'step-1', task_id: 'task-123', step_number: 1, step_name: 'Step A', status: 'completed' },
    ]
    let callIdx = 0

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'execution_steps') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: steps, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: task, error: null }),
        }
      }),
    } as unknown as SupabaseClient

    const result = await getTaskWithSteps(supabase, 'task-123')
    expect(result).not.toBeNull()
    expect(result?.task.id).toBe('task-123')
    expect(result?.steps).toHaveLength(1)
    void callIdx
  })
})
