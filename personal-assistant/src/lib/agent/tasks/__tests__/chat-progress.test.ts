import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import {
  subscribeToTaskProgress,
  unsubscribeFromTask,
  formatProgressMessage,
} from '../chat-progress'
import type { ExecutionTask } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id: 'task-abc',
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
  }
}

function buildMockSupabase(): { supabase: SupabaseClient; removeChannel: ReturnType<typeof vi.fn> } {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  } as unknown as RealtimeChannel

  const removeChannel = vi.fn()

  const supabase = {
    channel: vi.fn().mockReturnValue(channel),
    removeChannel,
  } as unknown as SupabaseClient

  return { supabase, removeChannel }
}

// ---------------------------------------------------------------------------
// subscribeToTaskProgress
// ---------------------------------------------------------------------------

describe('subscribeToTaskProgress', () => {
  it('creates a channel and subscribes', () => {
    const { supabase } = buildMockSupabase()
    const onProgress = vi.fn()

    const ch = subscribeToTaskProgress(supabase, 'task-abc', onProgress)

    expect(supabase.channel).toHaveBeenCalledWith(expect.stringContaining('task-progress:task-abc'))
    expect(ch).toBeDefined()
  })

  it('calls onProgress when an UPDATE payload arrives', () => {
    const { supabase } = buildMockSupabase()
    const onProgress = vi.fn()

    const fakeChannel = supabase.channel('x') as unknown as {
      on: ReturnType<typeof vi.fn>
      subscribe: ReturnType<typeof vi.fn>
    }

    let capturedListener: ((payload: unknown) => void) | undefined
    fakeChannel.on.mockImplementation((_event: unknown, _filter: unknown, cb: (payload: unknown) => void) => {
      capturedListener = cb
      return fakeChannel
    })

    subscribeToTaskProgress(supabase, 'task-abc', onProgress)

    const updatedTask = makeTask({ status: 'completed', progress_pct: 100 })
    capturedListener?.({ new: updatedTask })

    expect(onProgress).toHaveBeenCalledWith(updatedTask)
  })
})

// ---------------------------------------------------------------------------
// unsubscribeFromTask
// ---------------------------------------------------------------------------

describe('unsubscribeFromTask', () => {
  it('calls supabase.removeChannel with the channel', () => {
    const { supabase, removeChannel } = buildMockSupabase()
    const channel = { fake: true } as unknown as RealtimeChannel

    unsubscribeFromTask(supabase, channel)

    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})

// ---------------------------------------------------------------------------
// formatProgressMessage
// ---------------------------------------------------------------------------

describe('formatProgressMessage', () => {
  it('returns "Task completed" for completed status', () => {
    const task = makeTask({ status: 'completed', task_name: 'Send email' })
    expect(formatProgressMessage(task)).toBe('Task completed: Send email')
  })

  it('returns "Task failed" with error message for failed status', () => {
    const task = makeTask({ status: 'failed', task_name: 'Import data', error_message: 'timeout' })
    expect(formatProgressMessage(task)).toBe('Task failed: Import data — timeout')
  })

  it('returns "Task failed" without reason when no error message', () => {
    const task = makeTask({ status: 'failed', task_name: 'Import data', error_message: null })
    expect(formatProgressMessage(task)).toBe('Task failed: Import data')
  })

  it('returns "Task cancelled" for cancelled status', () => {
    const task = makeTask({ status: 'cancelled', task_name: 'Do something' })
    expect(formatProgressMessage(task)).toBe('Task cancelled: Do something')
  })

  it('includes progress_message and percentage when available', () => {
    const task = makeTask({
      status: 'working',
      progress_message: 'Analyzing data',
      progress_pct: 42,
    })
    expect(formatProgressMessage(task)).toBe('Running: Analyzing data (42%)')
  })

  it('omits percentage when progress_pct is 0', () => {
    const task = makeTask({
      status: 'working',
      progress_message: 'Initializing',
      progress_pct: 0,
    })
    expect(formatProgressMessage(task)).toBe('Running: Initializing')
  })

  it('shows step count when no progress message but total_steps is set', () => {
    const task = makeTask({
      status: 'working',
      progress_message: '',
      current_step: 2,
      total_steps: 5,
    })
    expect(formatProgressMessage(task)).toBe('Running: Test Task — step 2 of 5')
  })

  it('shows percentage when no progress message but progress_pct is set', () => {
    const task = makeTask({
      status: 'working',
      progress_message: '',
      progress_pct: 75,
      total_steps: null,
    })
    expect(formatProgressMessage(task)).toBe('Running: Test Task — 75%')
  })

  it('falls back to "Label: Name" with no progress info', () => {
    const task = makeTask({ status: 'pending', task_name: 'Queue me', progress_pct: 0 })
    expect(formatProgressMessage(task)).toBe('Queued: Queue me')
  })

  it('handles claimed status', () => {
    const task = makeTask({ status: 'claimed', task_name: 'Boot up' })
    expect(formatProgressMessage(task)).toBe('Starting: Boot up')
  })

  it('handles paused status', () => {
    const task = makeTask({ status: 'paused', task_name: 'Waiting' })
    expect(formatProgressMessage(task)).toBe('Paused: Waiting')
  })
})
