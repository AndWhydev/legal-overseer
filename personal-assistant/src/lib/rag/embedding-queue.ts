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

import { createClient } from '@supabase/supabase-js'
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
          // Mark as processing
          await supabase
            .from('embedding_jobs')
            .update({ status: 'processing', started_at: new Date().toISOString() })
            .eq('id', job.id)

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
  supabase: ReturnType<typeof createClient>,
  orgId?: string
): Promise<QueueStats> {
  try {
    const baseQuery = orgId ? { org_id: orgId } : {}

    // Fetch all stats
    const { data, error } = await supabase
      .from('embedding_jobs')
      .select('*', { count: 'exact' })
      .match(baseQuery)

    if (error || !data) {
      logger.warn('[embedding-queue] Failed to fetch queue stats:', error)
      return {
        queueDepth: 0,
        processingCount: 0,
        failedCount: 0,
        completedToday: 0,
        averageProcessingTimeMs: 0,
      }
    }

    const stats: QueueStats = {
      queueDepth: data.filter((j) => (j as EmbeddingJob).status === 'pending').length,
      processingCount: data.filter((j) => (j as EmbeddingJob).status === 'processing').length,
      failedCount: data.filter((j) => (j as EmbeddingJob).status === 'failed').length,
      completedToday: data.filter((j) => {
        const job = j as EmbeddingJob
        const today = new Date().toDateString()
        const completedDate = job.completed_at ? new Date(job.completed_at).toDateString() : null
        return job.status === 'completed' && completedDate === today
      }).length,
      averageProcessingTimeMs: 0,
    }

    // Calculate average processing time for completed jobs
    const completedJobs = data.filter((j) => (j as EmbeddingJob).status === 'completed') as EmbeddingJob[]
    if (completedJobs.length > 0) {
      const processingTimes = completedJobs
        .filter((j) => j.started_at && j.completed_at)
        .map((j) => new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime())

      if (processingTimes.length > 0) {
        stats.averageProcessingTimeMs = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      }
    }

    return stats
  } catch (err) {
    logger.error('[embedding-queue] Queue stats exception:', err)
    return {
      queueDepth: 0,
      processingCount: 0,
      failedCount: 0,
      completedToday: 0,
      averageProcessingTimeMs: 0,
    }
  }
}

/**
 * Clear stale jobs (e.g., hung in 'processing' state for >1 hour).
 * Resets them to 'pending' for retry.
 */
export async function clearStaleJobs(
  supabase: ReturnType<typeof createClient>,
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
