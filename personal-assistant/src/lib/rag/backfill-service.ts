/**
 * Backfill Service for Historical RAG Import
 *
 * Cursor-based, resumable backfill orchestrator for embedding historical messages
 * from channel_messages into Pinecone via the Voyage-3.5 embedding service.
 * Tracks progress in the backfill_jobs table.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { embedAndUpsert } from './embedding-service'
import type { VectorDocument } from './types'
import { logger } from '@/lib/core/logger'

interface BackfillJob {
  id: string
  org_id: string
  channel_type: string
  status: string
  cursor: string | null
  total_messages: number
  embedded_messages: number
  failed_messages: number
  backfill_days: number
}

/**
 * Start or resume a backfill job for an org/channel.
 * Processes messages in batches of 100, updating cursor after each batch.
 */
export async function runBackfill(
  supabase: SupabaseClient,
  jobId: string
): Promise<{ embedded: number; failed: number }> {
  // 1. Load the job
  const { data: job } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Backfill job ${jobId} not found`)

  // 2. Mark as in_progress
  await supabase
    .from('backfill_jobs')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  const batchSize = 100
  let totalEmbedded = job.embedded_messages || 0
  let totalFailed = job.failed_messages || 0
  let cursor = job.cursor

  try {
    // 3. Calculate date range
    const sinceDate = new Date(Date.now() - (job.backfill_days || 90) * 24 * 60 * 60 * 1000).toISOString()

    // 4. Process in batches
    let hasMore = true
    while (hasMore) {
      // Query messages from channel_messages
      let query = supabase
        .from('channel_messages')
        .select('id, external_id, channel, sender, sender_email, subject, body, body_full, received_at')
        .eq('org_id', job.org_id)
        .eq('channel', job.channel_type)
        .gte('received_at', sinceDate)
        .order('received_at', { ascending: true })
        .limit(batchSize)

      if (cursor) {
        query = query.gt('received_at', cursor)
      }

      const { data: messages, error } = await query

      if (error) {
        logger.error('[backfill] Query failed:', error)
        break
      }

      if (!messages || messages.length === 0) {
        hasMore = false
        break
      }

      // 5. Build VectorDocuments
      const docs: VectorDocument[] = messages
        .filter(m => (m.body_full || m.body)?.length > 0)
        .map(m => ({
          messageId: m.external_id || m.id,
          orgId: job.org_id,
          content: m.body_full || m.body,
          metadata: {
            message_id: m.external_id || m.id,
            org_id: job.org_id,
            channel: m.channel,
            sender: m.sender || 'unknown',
            sender_email: m.sender_email,
            subject: m.subject,
            received_at: m.received_at,
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: Boolean(m.body_full),
          },
        }))

      // 6. Embed and upsert
      if (docs.length > 0) {
        const result = await embedAndUpsert(docs)
        totalEmbedded += result.embedded
        totalFailed += result.failed
      }

      // 7. Update cursor and progress
      cursor = messages[messages.length - 1].received_at
      await supabase
        .from('backfill_jobs')
        .update({
          cursor,
          embedded_messages: totalEmbedded,
          failed_messages: totalFailed,
          total_messages: (job.total_messages || 0) + messages.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      logger.info('[backfill] Batch processed', {
        jobId,
        batchSize: messages.length,
        totalEmbedded,
        totalFailed,
      })

      if (messages.length < batchSize) {
        hasMore = false
      }
    }

    // 8. Mark as completed
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'failed',
        error_message: errMsg,
        embedded_messages: totalEmbedded,
        failed_messages: totalFailed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    logger.error('[backfill] Job failed:', err)
  }

  return { embedded: totalEmbedded, failed: totalFailed }
}

/**
 * Create a new backfill job for an org/channel.
 */
export async function createBackfillJob(
  supabase: SupabaseClient,
  orgId: string,
  channelType: string,
  backfillDays: number = 90
): Promise<string> {
  const { data, error } = await supabase
    .from('backfill_jobs')
    .insert({
      org_id: orgId,
      channel_type: channelType,
      status: 'pending',
      backfill_days: backfillDays,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create backfill job: ${error.message}`)
  return data.id
}

/**
 * Get the status of a backfill job.
 */
export async function getBackfillStatus(
  supabase: SupabaseClient,
  jobId: string
): Promise<BackfillJob | null> {
  const { data } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  return data as BackfillJob | null
}
