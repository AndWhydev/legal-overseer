import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionTask } from './types'
import { calculateRetryDelay } from './fsm'
import { writeToDeadLetterQueue } from '@/lib/agent/dlq'

/**
 * Returns true if the task is in a failed state and has remaining retry attempts.
 */
export function shouldRetry(task: ExecutionTask): boolean {
  return task.status === 'failed' && task.retry_count < task.max_retries
}

/**
 * Calculates the delay (in milliseconds) before the next retry attempt,
 * using the task's configured retry policy and current retry_count.
 */
export function getRetryDelay(task: ExecutionTask): number {
  return calculateRetryDelay(
    task.retry_count,
    task.retry_policy.strategy,
    task.retry_policy.base_delay_ms,
    task.retry_policy.max_delay_ms,
  )
}

/**
 * Atomically transitions a failed task back to pending and increments retry_count.
 * Uses optimistic concurrency: only updates rows that are still in 'failed' status.
 * Clears worker_id, claimed_at, and heartbeat_at to allow re-claim.
 * Returns null if the state has already changed (race condition).
 *
 * @param newRetryCount - the new retry_count value to set (caller's responsibility to increment)
 */
export async function enqueueRetry(
  supabase: SupabaseClient,
  taskId: string,
  newRetryCount = 1,
): Promise<ExecutionTask | null> {
  const { data, error } = await supabase
    .from('execution_tasks')
    .update({
      status: 'pending',
      retry_count: newRetryCount,
      worker_id: null,
      claimed_at: null,
      heartbeat_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'failed') // optimistic concurrency guard
    .select()
    .single()

  if (error || !data) return null
  return data as ExecutionTask
}

/**
 * Writes a terminally failed task to the dead letter queue.
 * The task's status remains 'failed' — no further transitions.
 */
export async function sendToDeadLetter(
  supabase: SupabaseClient,
  task: ExecutionTask,
): Promise<void> {
  await writeToDeadLetterQueue(supabase, {
    orgId: task.org_id,
    agentType: 'execution_task',
    agentRunId: task.id,
    errorMessage: task.error_message ?? 'Task failed with no error message',
    payload: {
      taskId: task.id,
      taskName: task.task_name,
      taskPayload: task.task_payload,
      retryCount: task.retry_count,
      lastError: task.error_message,
    },
  })
}
