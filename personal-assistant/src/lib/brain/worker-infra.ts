/**
 * BullMQ Worker Infrastructure — Living Brain queue system.
 *
 * Creates queues for each domain (financial, relational, operational, behavioral)
 * plus intake and synthesis meta-queues. Workers consume jobs from these queues
 * to compile entity dossiers and domain profiles.
 *
 * Redis connection reads REDIS_URL env var; falls back to localhost:6379 for dev.
 */

import { Queue, Worker, type ConnectionOptions, type WorkerOptions } from 'bullmq'
import { logger } from '@/lib/core/logger'
import type { DomainType } from './types'

// ─── Queue Names ───────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  intake: 'memory:intake',
  financial: 'memory:financial',
  relational: 'memory:relational',
  operational: 'memory:operational',
  behavioral: 'memory:behavioral',
  synthesis: 'memory:synthesis',
  crawl: 'memory:crawl',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

// ─── Job Type Interfaces ───────────────────────────────────────────────────

export interface IntakeJob {
  org_id: string
  wal_entry_ids: string[]
  batch_window_start: string
}

export interface LibrarianJob {
  org_id: string
  entity_id: string
  fact_ids: string[]
  domain: DomainType
}

export interface SynthesisJob {
  org_id: string
  trigger: 'librarian_complete' | 'manual' | 'scheduled'
  updated_entity_ids: string[]
}

export interface ConnectionCrawlJob {
  orgId: string
  appKey: string
  connectedAccountId: string
}

// ─── Redis Connection ──────────────────────────────────────────────────────

/**
 * Parse REDIS_URL into BullMQ ConnectionOptions.
 * Supports redis:// and rediss:// (TLS) protocols.
 * Falls back to localhost:6379 when REDIS_URL is not set.
 */
export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    logger.warn('[worker-infra] REDIS_URL not set, falling back to localhost:6379')
    return { host: 'localhost', port: 6379 }
  }

  try {
    const parsed = new URL(redisUrl)
    const tls = parsed.protocol === 'rediss:'
    const connection: ConnectionOptions = {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      ...(parsed.username && parsed.username !== '' && { username: parsed.username }),
      ...(parsed.password && { password: parsed.password }),
      ...(tls && { tls: {} }),
    }
    return connection
  } catch (err) {
    logger.warn('[worker-infra] Failed to parse REDIS_URL, falling back to localhost:6379', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { host: 'localhost', port: 6379 }
  }
}

// ─── Queue Factory ─────────────────────────────────────────────────────────

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
}

/**
 * Create Queue instances for all 6 brain queues.
 * Each queue uses shared Redis connection and default job options.
 */
export function createBrainQueues(): Record<string, Queue> {
  const connection = getRedisConnection()
  const queues: Record<string, Queue> = {}

  for (const [key, name] of Object.entries(QUEUE_NAMES)) {
    queues[key] = new Queue(name, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }

  return queues
}

// ─── Worker Factory ────────────────────────────────────────────────────────

/**
 * Generic worker factory with configurable concurrency.
 * Wraps BullMQ Worker with standard error logging.
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: { data: T; id?: string }) => Promise<void>,
  opts?: { concurrency?: number },
): Worker<T> {
  const connection = getRedisConnection()
  const concurrency = opts?.concurrency ?? 5

  const worker = new Worker<T>(
    queueName,
    async (job) => {
      await processor({ data: job.data, id: job.id })
    },
    {
      connection,
      concurrency,
    } satisfies WorkerOptions,
  )

  worker.on('failed', (job, err) => {
    logger.error(`[worker-infra] Job failed in ${queueName}`, {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    })
  })

  worker.on('error', (err) => {
    logger.error(`[worker-infra] Worker error in ${queueName}`, {
      error: err.message,
    })
  })

  return worker
}
