/**
 * Embedding Job Queue Service
 *
 * Decouples message embedding from the relay daemon using Supabase as a job queue.
 * Workers (Cloudflare/Fly.io) poll this table and process jobs asynchronously.
 *
 * Flow:
 * 1. relay-daemon enqueues embedding jobs
 * 2. Worker polls embedding_jobs table every N seconds
 * 3. Worker processes batch of pending jobs
 * 4. Updates status to 'completed' or 'failed' with error details
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { embedAndUpsert, deleteMessageVectors } from './embedding-service'
import type { VectorDocument, PineconeMetadata } from './types'

interface EmbeddingJob {
  id: string
  org_id: string
  message_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content: string
  metadata: PineconeMetadata | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
  retry_count: number
  max_retries: number
}

interface QueueStats {
  queueDepth: number
  processingCount: number
  failedCount: number
  completedToday: number
  averageProcessingTimeMs: number
}

/**
 * Enqueue a message for embedding.
 * Inserts or updates a row in embedding_jobs table.
 */
export async function enqueueEmbedding(
  supabase: SupabaseClient,
  orgId: string,
  messageId: string,
  content: string,
  metadata: PineconeMetadata
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('embedding_jobs')
      .upsert(
        {
          org_id: orgId,
          message_id: messageId,
          content,
          metadata,
          status: 'pending',
          retry_count: 0,
        },
        { onConflict: 'org_id,message_id' }
      )
      .select('id')
      .single()

    if (error) {
      logger.error('[embedding-queue] Enqueue failed:', { orgId, messageId, error })
      return { success: false, error: error.message }
    }

    logger.debug('[embedding-queue] Job enqueued', {
      jobId: data?.id,
      orgId,
      messageId,
      contentLength: content.length,
    })

    return { success: true, jobId: data?.id }
  } catch (err) {
    logger.error('[embedding-queue] Enqueue exception:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Process a batch of pending embedding jobs.
 * Called by worker endpoints (Cloudflare/Fly.io) every N seconds.
 *
 * Strategy:
 * - Fetch next `batchSize` pending jobs
 * - Mark as 'processing' to prevent duplicate processing
 * - Embed and upsert to Pinecone
 * - Mark as 'completed' or 'failed' with error details
 * - Retry up to max_retries times
 */
export async function processEmbeddingQueue(
  supabase: SupabaseClient,
  batchSize: number = 10
): Promise<{ processed: number; completed: number; failed: number; errors: string[] }> {
  const result = { processed: 0, completed: 0, failed: 0, errors: [] as string[] }

  try {
    // Fetch pending jobs, ordered by creation date (FIFO)
    const { data: jobs, error: fetchErr } = await supabase
      .from('embedding_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (fetchErr) {
      result.errors.push(`Failed to fetch jobs: ${fetchErr.message}`)
      return result
    }

    if (!jobs || jobs.length === 0) {
      return result
    }

    logger.info('[embedding-queue] Processing batch', { batchSize: jobs.length })

    // Group jobs by org for batch processing
    const jobsByOrg = new Map<string, EmbeddingJob[]>()
    for (const job of jobs as EmbeddingJob[]) {
      const group = jobsByOrg.get(job.org_id) ?? []
      group.push(job)
      jobsByOrg.set(job.org_id, group)
    }

    // Process each org's batch
    for (const [orgId, orgJobs] of jobsByOrg) {
      for (const job of orgJobs) {
        try {
          // Atomically claim the job: only update if still 'pending'.
          // This prevents duplicate processing when multiple workers
          // poll the queue concurrently.
          const { data: claimed, error: claimErr } = await supabase
            .from('embedding_jobs')
            .update({ status: 'processing', started_at: new Date().toISOString() })
            .eq('id', job.id)
            .eq('status', 'pending')
            .select('id')

          if (claimErr || !claimed || claimed.length === 0) {
            // Another worker already claimed this job — skip it
            logger.debug('[embedding-queue] Job already claimed by another worker', {
              jobId: job.id,
            })
            continue
          }

          // Prepare vector document
          const doc: VectorDocument = {
            messageId: job.message_id,
            orgId,
            content: job.content,
            metadata: job.metadata || {
              message_id: job.message_id,
              org_id: orgId,
              channel: 'unknown',
              sender: 'unknown',
              received_at: new Date().toISOString(),
              chunk_index: 0,
              total_chunks: 1,
              is_full_body: true,
            },
          }

          // Embed and upsert (pass Supabase for entity extraction context)
          const embedResult = await embedAndUpsert([doc], supabase)

          if (embedResult.failed > 0 && embedResult.embedded === 0) {
            // All embeddings failed
            const shouldRetry = job.retry_count < job.max_retries
            const error = embedResult.errors[0] || 'Unknown embedding error'

            if (shouldRetry) {
              // Reset to pending for retry
              await supabase
                .from('embedding_jobs')
                .update({
                  status: 'pending',
                  retry_count: job.retry_count + 1,
                  started_at: null,
                  error: `Retry ${job.retry_count + 1}/${job.max_retries}: ${error}`,
                })
                .eq('id', job.id)

              logger.warn('[embedding-queue] Job failed, retrying', {
                jobId: job.id,
                retryCount: job.retry_count + 1,
                error,
              })

              result.failed++
            } else {
              // Max retries exceeded
              await supabase
                .from('embedding_jobs')
                .update({
                  status: 'failed',
                  completed_at: new Date().toISOString(),
                  error: `Max retries (${job.max_retries}) exceeded: ${error}`,
                })
                .eq('id', job.id)

              logger.error('[embedding-queue] Job max retries exceeded', {
                jobId: job.id,
                maxRetries: job.max_retries,
                error,
              })

              result.failed++
            }
          } else {
            // Success
            await supabase
              .from('embedding_jobs')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                error: null,
              })
              .eq('id', job.id)

            logger.debug('[embedding-queue] Job completed', {
              jobId: job.id,
              messageId: job.message_id,
              embedded: embedResult.embedded,
            })

            if (job.metadata?.recontextualize) {
              logger.info('[embedding-queue] Re-contextualized:', {
                jobId: job.id,
                messageId: job.message_id,
                channel: job.metadata.channel,
              })
            }

            result.completed++
          }

          result.processed++
        } catch (jobErr) {
          const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr)

          logger.error('[embedding-queue] Job processing exception', {
            jobId: job.id,
            error: errMsg,
          })

          // Mark as failed or retry based on retry count
          const shouldRetry = job.retry_count < job.max_retries

          if (shouldRetry) {
            await supabase
              .from('embedding_jobs')
              .update({
                status: 'pending',
                retry_count: job.retry_count + 1,
                started_at: null,
                error: `Retry ${job.retry_count + 1}/${job.max_retries}: ${errMsg}`,
              })
              .eq('id', job.id)

            result.failed++
          } else {
            await supabase
              .from('embedding_jobs')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error: `Max retries (${job.max_retries}) exceeded: ${errMsg}`,
              })
              .eq('id', job.id)

            result.failed++
          }

          result.errors.push(errMsg)
          result.processed++
        }
      }
    }

    logger.info('[embedding-queue] Batch complete', result)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    result.errors.push(errMsg)
    logger.error('[embedding-queue] Queue processing exception:', err)
  }

  return result
}

/**
 * Get current queue statistics for monitoring.
 */
export async function getQueueStats(
  supabase: SupabaseClient,
  orgId?: string
): Promise<QueueStats> {
  const defaultStats: QueueStats = {
    queueDepth: 0,
    processingCount: 0,
    failedCount: 0,
    completedToday: 0,
    averageProcessingTimeMs: 0,
  }

  try {
    // Use server-side count queries instead of fetching all rows into memory.
    // Each query returns only the count, not the row data.
    const buildQuery = (status: string) => {
      let q = supabase.from('embedding_jobs').select('*', { count: 'exact', head: true }).eq('status', status)
      if (orgId) q = q.eq('org_id', orgId)
      return q
    }

    const [pendingRes, processingRes, failedRes] = await Promise.all([
      buildQuery('pending'),
      buildQuery('processing'),
      buildQuery('failed'),
    ])

    const stats: QueueStats = {
      queueDepth: pendingRes.count ?? 0,
      processingCount: processingRes.count ?? 0,
      failedCount: failedRes.count ?? 0,
      completedToday: 0,
      averageProcessingTimeMs: 0,
    }

    // Count completed today (server-side filter)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    let completedTodayQuery = supabase
      .from('embedding_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', todayStart.toISOString())
    if (orgId) completedTodayQuery = completedTodayQuery.eq('org_id', orgId)
    const completedTodayRes = await completedTodayQuery
    stats.completedToday = completedTodayRes.count ?? 0

    // Calculate average processing time from a sample of recent completed jobs
    let avgQuery = supabase
      .from('embedding_jobs')
      .select('started_at, completed_at')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100)
    if (orgId) avgQuery = avgQuery.eq('org_id', orgId)
    const { data: recentCompleted } = await avgQuery

    if (recentCompleted && recentCompleted.length > 0) {
      const processingTimes = recentCompleted
        .map((j) => new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime())
        .filter((t) => t >= 0)

      if (processingTimes.length > 0) {
        stats.averageProcessingTimeMs = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      }
    }

    return stats
  } catch (err) {
    logger.error('[embedding-queue] Queue stats exception:', err)
    return defaultStats
  }
}

/**
 * Clear stale jobs (e.g., hung in 'processing' state for >1 hour).
 * Resets them to 'pending' for retry.
 */
export async function clearStaleJobs(
  supabase: SupabaseClient,
  staleThresholdMs: number = 3600000 // 1 hour
): Promise<{ clearedCount: number }> {
  try {
    const staleDate = new Date(Date.now() - staleThresholdMs).toISOString()

    const { data, error } = await supabase
      .from('embedding_jobs')
      .update({
        status: 'pending',
        started_at: null,
        error: 'Recovered from stale processing state',
      })
      .eq('status', 'processing')
      .lt('started_at', staleDate)
      .select('*')

    if (error) {
      logger.error('[embedding-queue] Failed to clear stale jobs:', error)
      return { clearedCount: 0 }
    }

    const clearedCount = data?.length ?? 0
    logger.info('[embedding-queue] Cleared stale jobs', { clearedCount, staleThresholdMs })

    return { clearedCount }
  } catch (err) {
    logger.error('[embedding-queue] Clear stale jobs exception:', err)
    return { clearedCount: 0 }
  }
}
