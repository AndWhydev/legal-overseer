/**
 * Connection Crawl Dispatcher
 *
 * Enqueues a ConnectionCrawlJob onto the `memory:crawl` BullMQ queue
 * after a Composio connection is successfully established. The job is
 * consumed by `processConnectionConnected` in the knowledge-librarian
 * worker, which builds a dossier and writes it into the Living Brain WAL.
 *
 * Idempotency: if a crawl job for the same connectedAccountId is
 * already queued/active/waiting/delayed, this is a no-op. We use the
 * connectedAccountId as the BullMQ job id so duplicate enqueues are
 * rejected by BullMQ itself (it silently drops duplicates).
 */

import { Queue } from 'bullmq'

import { logger } from '@/lib/core/logger'
import {
  QUEUE_NAMES,
  getRedisConnection,
  type ConnectionCrawlJob,
} from '@/lib/brain/worker-infra'

// ─── Queue name export ──────────────────────────────────────────────────────

/**
 * The BullMQ queue name this dispatcher writes to.
 * Worker consumers should listen on this exact name.
 */
export const CRAWL_QUEUE_NAME = QUEUE_NAMES.crawl

// ─── Lazy singleton queue ──────────────────────────────────────────────────

let crawlQueue: Queue<ConnectionCrawlJob> | null = null

function getCrawlQueue(): Queue<ConnectionCrawlJob> {
  if (crawlQueue) return crawlQueue
  crawlQueue = new Queue<ConnectionCrawlJob>(CRAWL_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  })
  return crawlQueue
}

/**
 * Test-only: override the queue with a fake. Clears to null when called
 * with null. Never use in production.
 */
export function _setCrawlQueueForTest(q: Queue<ConnectionCrawlJob> | null): void {
  crawlQueue = q
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export interface DispatchConnectionCrawlParams {
  orgId: string
  appKey: string
  connectedAccountId: string
}

export interface DispatchResult {
  enqueued: boolean
  /** Reason for skipping, if enqueued === false. */
  skipped?: 'duplicate' | 'error'
  jobId?: string
}

/**
 * Enqueue a connection crawl job. Idempotent on connectedAccountId.
 *
 * Returns { enqueued: true, jobId } on first enqueue.
 * Returns { enqueued: false, skipped: 'duplicate' } if a job for this
 * connectedAccountId is already queued/active/waiting/delayed.
 * Returns { enqueued: false, skipped: 'error' } on Redis/BullMQ errors.
 * Never throws.
 */
export async function dispatchConnectionCrawl(
  params: DispatchConnectionCrawlParams,
): Promise<DispatchResult> {
  const { orgId, appKey, connectedAccountId } = params
  const jobId = `crawl:${connectedAccountId}`

  try {
    const queue = getCrawlQueue()

    // Idempotency check: is a job for this connection already in-flight?
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState().catch(() => 'unknown')
      // "completed" / "failed" are terminal — we allow re-enqueue only
      // if the prior job reached a terminal state.
      if (state !== 'completed' && state !== 'failed' && state !== 'unknown') {
        logger.info('[dispatch-crawl] Duplicate crawl suppressed', {
          orgId,
          appKey,
          connectedAccountId,
          state,
        })
        return { enqueued: false, skipped: 'duplicate', jobId }
      }
    }

    const payload: ConnectionCrawlJob = { orgId, appKey, connectedAccountId }
    await queue.add(jobId, payload, { jobId })

    logger.info('[dispatch-crawl] Enqueued connection crawl', {
      orgId,
      appKey,
      connectedAccountId,
      jobId,
    })

    return { enqueued: true, jobId }
  } catch (err) {
    logger.error('[dispatch-crawl] Failed to enqueue crawl', {
      orgId,
      appKey,
      connectedAccountId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { enqueued: false, skipped: 'error', jobId }
  }
}
