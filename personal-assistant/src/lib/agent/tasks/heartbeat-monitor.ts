import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ExecutionTask } from './types'
import { shouldRetry, enqueueRetry, sendToDeadLetter } from './retry-engine'

const ORPHAN_ERROR = 'Worker heartbeat lost — task orphaned'

export interface DetectOrphansOptions {
  /** How old a heartbeat must be to count as stale. Default: 90000ms (90s) */
  staleThresholdMs?: number
}

/**
 * Detects tasks stuck in 'claimed' or 'working' with a stale heartbeat,
 * then either re-enqueues them for retry or sends them to the dead letter queue.
 *
 * Returns counts of recovered (re-queued) and dead-lettered tasks.
 */
export async function detectAndRecoverOrphans(
  supabase: SupabaseClient,
  opts?: DetectOrphansOptions,
): Promise<{ recovered: number; deadLettered: number }> {
  const staleThresholdMs = opts?.staleThresholdMs ?? 90000
  const staleBeforeIso = new Date(Date.now() - staleThresholdMs).toISOString()

  const { data: orphans, error } = await supabase
    .from('execution_tasks')
    .select('*')
    .in('status', ['claimed', 'working'])
    .lt('heartbeat_at', staleBeforeIso)

  if (error) {
    logger.error('[heartbeat-monitor] Failed to query orphaned tasks', error.message)
    return { recovered: 0, deadLettered: 0 }
  }

  if (!orphans || orphans.length === 0) {
    return { recovered: 0, deadLettered: 0 }
  }

  logger.info(`[heartbeat-monitor] Found ${orphans.length} orphaned task(s)`)

  let recovered = 0
  let deadLettered = 0

  for (const orphan of orphans as ExecutionTask[]) {
    // Mark as failed atomically (only if still in claimed/working)
    const { error: failError } = await supabase
      .from('execution_tasks')
      .update({
        status: 'failed',
        error_message: ORPHAN_ERROR,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orphan.id)
      .in('status', ['claimed', 'working'])

    if (failError) {
      logger.warn(`[heartbeat-monitor] Failed to mark orphan ${orphan.id} as failed`, failError.message)
      continue
    }

    const failedTask: ExecutionTask = { ...orphan, status: 'failed', error_message: ORPHAN_ERROR }

    if (shouldRetry(failedTask)) {
      await enqueueRetry(supabase, orphan.id, orphan.retry_count + 1)
      logger.info(`[heartbeat-monitor] Recovered orphan ${orphan.id} (retry ${orphan.retry_count + 1}/${orphan.max_retries})`)
      recovered++
    } else {
      await sendToDeadLetter(supabase, failedTask)
      logger.warn(`[heartbeat-monitor] Dead-lettered orphan ${orphan.id} (retries exhausted: ${orphan.retry_count}/${orphan.max_retries})`)
      deadLettered++
    }
  }

  return { recovered, deadLettered }
}

/**
 * Update the heartbeat timestamp for a running task to prevent orphan detection.
 */
export async function sendHeartbeat(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  const { error } = await supabase
    .from('execution_tasks')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) {
    logger.warn(`[heartbeat-monitor] Failed to send heartbeat for task ${taskId}`, error.message)
  }
}
