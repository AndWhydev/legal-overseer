import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionTask } from './types'
import { claimTask, startTask, completeTask, failTask, sendHeartbeat, updateProgress } from './task-service'
import { startStep, completeStep, failStep } from './step-tracker'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TaskExecutor {
  /** Execute the task payload. Called once per task (or per retry). */
  execute: (
    task: ExecutionTask,
    context: TaskExecutionContext,
  ) => Promise<Record<string, unknown>>
}

export interface TaskExecutionContext {
  supabase: SupabaseClient
  /** AbortSignal that fires if the task is cancelled externally. */
  signal: AbortSignal
  updateProgress: (updates: {
    current_step?: number
    progress_pct?: number
    progress_message?: string
  }) => Promise<void>
  startStep: (stepNumber: number) => Promise<void>
  completeStep: (stepNumber: number, output: Record<string, unknown>) => Promise<void>
  failStep: (stepNumber: number, errorMessage: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Executor registry
// ---------------------------------------------------------------------------

/** Registry of task_type -> executor. Populated by downstream phases (CUA, workspace, etc.) */
const executorRegistry = new Map<string, TaskExecutor>()

export function registerTaskExecutor(taskType: string, executor: TaskExecutor): void {
  executorRegistry.set(taskType, executor)
}

export function getTaskExecutor(taskType: string): TaskExecutor | undefined {
  return executorRegistry.get(taskType)
}

// ---------------------------------------------------------------------------
// runTask
// ---------------------------------------------------------------------------

/**
 * Run a task through its full lifecycle: claim -> start -> execute -> complete/fail.
 * Manages heartbeat interval and AbortController for cancellation.
 *
 * @param supabase - Supabase client
 * @param taskId   - ID of the task to run (must be in 'pending' state)
 * @param workerId - Unique identifier for this worker instance
 */
export async function runTask(
  supabase: SupabaseClient,
  taskId: string,
  workerId: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Claim (pending -> claimed)
  const claimed = await claimTask(supabase, taskId, workerId)
  if (!claimed) {
    return { success: false, error: 'Failed to claim task — already claimed or invalid state' }
  }

  // 2. Start (claimed -> working)
  const started = await startTask(supabase, taskId)
  if (!started) {
    return { success: false, error: 'Failed to start task — state conflict' }
  }

  // 3. Find executor
  const executor = getTaskExecutor(started.task_type)
  if (!executor) {
    await failTask(supabase, taskId, {
      message: `No executor registered for task type: ${started.task_type}`,
    })
    return { success: false, error: `No executor for type: ${started.task_type}` }
  }

  // 4. Set up heartbeat interval (every 15 seconds)
  const abortController = new AbortController()
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendHeartbeat(supabase, taskId)
    } catch (err) {
      logger.warn('[task-runner] Heartbeat failed', { taskId, error: err })
    }
  }, 15_000)

  // 5. Build execution context
  const context: TaskExecutionContext = {
    supabase,
    signal: abortController.signal,
    updateProgress: (updates) => updateProgress(supabase, taskId, updates),
    startStep: (stepNumber) => startStep(supabase, taskId, stepNumber).then(() => {}),
    completeStep: (stepNumber, output) => completeStep(supabase, taskId, stepNumber, output).then(() => {}),
    failStep: (stepNumber, errorMessage) => failStep(supabase, taskId, stepNumber, errorMessage).then(() => {}),
  }

  try {
    // 6. Execute
    const result = await executor.execute(started, context)

    // 7. Complete (working -> completed)
    clearInterval(heartbeatInterval)
    await completeTask(supabase, taskId, result)
    return { success: true }
  } catch (err) {
    // 8. Fail + retry or DLQ
    clearInterval(heartbeatInterval)
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined

    const { task, retrying } = await failTask(supabase, taskId, {
      message: errorMessage,
      stack: errorStack,
    })

    if (retrying) {
      logger.info('[task-runner] Task will retry', {
        taskId,
        retryCount: task.retry_count,
        maxRetries: task.max_retries,
      })
    } else {
      logger.warn('[task-runner] Task permanently failed', {
        taskId,
        errorMessage,
      })
    }

    return { success: false, error: errorMessage }
  }
}
