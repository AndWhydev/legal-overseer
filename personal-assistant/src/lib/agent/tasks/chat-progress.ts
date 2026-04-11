import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { ExecutionTask, TaskStatus } from './types'

export interface TaskProgressCallback {
  (task: ExecutionTask): void
}

/**
 * Subscribe to Realtime updates for a specific execution task.
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeToTaskProgress(
  supabase: SupabaseClient,
  taskId: string,
  onProgress: TaskProgressCallback,
): RealtimeChannel {
  const channelName = `task-progress:${taskId}:${Date.now()}`

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as never,
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'execution_tasks',
        filter: `id=eq.${taskId}`,
      },
      (payload: unknown) => {
        const p = payload as { new: ExecutionTask }
        onProgress(p.new)
      },
    )
    .subscribe()

  return channel
}

/**
 * Unsubscribe from a task progress channel.
 */
export function unsubscribeFromTask(
  supabase: SupabaseClient,
  channel: RealtimeChannel,
): void {
  supabase.removeChannel(channel)
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Queued',
  claimed: 'Starting',
  working: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/**
 * Format an ExecutionTask into a user-friendly progress message for chat display.
 */
export function formatProgressMessage(task: ExecutionTask): string {
  const label = STATUS_LABELS[task.status] ?? task.status
  const name = task.task_name

  if (task.status === 'completed') {
    return `Task completed: ${name}`
  }

  if (task.status === 'failed') {
    const reason = task.error_message ? ` — ${task.error_message}` : ''
    return `Task failed: ${name}${reason}`
  }

  if (task.status === 'cancelled') {
    return `Task cancelled: ${name}`
  }

  if (task.progress_message) {
    const pct = task.progress_pct > 0 ? ` (${task.progress_pct}%)` : ''
    return `${label}: ${task.progress_message}${pct}`
  }

  if (task.total_steps && task.total_steps > 0) {
    return `${label}: ${name} — step ${task.current_step} of ${task.total_steps}`
  }

  if (task.progress_pct > 0) {
    return `${label}: ${name} — ${task.progress_pct}%`
  }

  return `${label}: ${name}`
}
