import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleCancelTask } from '../cancel-task'

vi.mock('@/lib/agent/tasks/task-service', () => ({
  cancelTask: vi.fn(),
}))

import { cancelTask } from '@/lib/agent/tasks/task-service'

const mockCancelTask = vi.mocked(cancelTask)

function makeCancelledTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-xyz',
    org_id: 'org-1',
    thread_id: null,
    task_type: 'standard' as const,
    task_name: 'My Task',
    task_payload: {},
    status: 'cancelled',
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
    cancelled_at: '2026-04-09T10:00:00Z',
    cancelled_by: 'user',
    partial_result: null,
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T10:00:00Z',
    ...overrides,
  }
}

const mockSupabase = {} as SupabaseClient

describe('handleCancelTask', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns success with task details when cancellation succeeds', async () => {
    const task = makeCancelledTask()
    mockCancelTask.mockResolvedValue(task as never)

    const result = await handleCancelTask({ task_id: 'task-xyz' }, 'org-1', mockSupabase)

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      task_id: 'task-xyz',
      task_name: 'My Task',
      status: 'cancelled',
      message: 'Task "My Task" has been cancelled.',
    })
    expect(mockCancelTask).toHaveBeenCalledWith(mockSupabase, 'task-xyz', 'user')
  })

  it('returns failure when cancelTask returns null', async () => {
    mockCancelTask.mockResolvedValue(null)

    const result = await handleCancelTask({ task_id: 'task-xyz' }, 'org-1', mockSupabase)

    expect(result.success).toBe(false)
    expect(result.error).toContain('task-xyz')
  })

  it('returns friendly error when task is in terminal state', async () => {
    mockCancelTask.mockRejectedValue(new Error('TASK_NOT_CANCELLABLE: status is completed'))

    const result = await handleCancelTask({ task_id: 'task-xyz' }, 'org-1', mockSupabase)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot cancel this task')
    expect(result.error).toContain('completed')
  })

  it('returns friendly error when task is not found', async () => {
    mockCancelTask.mockRejectedValue(new Error('TASK_NOT_FOUND'))

    const result = await handleCancelTask({ task_id: 'task-xyz' }, 'org-1', mockSupabase)

    expect(result.success).toBe(false)
    expect(result.error).toContain('task-xyz')
    expect(result.error).toContain('not found')
  })

  it('returns generic error for unexpected failures', async () => {
    mockCancelTask.mockRejectedValue(new Error('Connection timeout'))

    const result = await handleCancelTask({ task_id: 'task-xyz' }, 'org-1', mockSupabase)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection timeout')
  })

  it('passes the reason field without error (reason is informational only)', async () => {
    const task = makeCancelledTask()
    mockCancelTask.mockResolvedValue(task as never)

    const result = await handleCancelTask(
      { task_id: 'task-xyz', reason: 'User changed their mind' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(true)
    // cancelTask is always called with 'user' — reason is not forwarded to service
    expect(mockCancelTask).toHaveBeenCalledWith(mockSupabase, 'task-xyz', 'user')
  })
})
