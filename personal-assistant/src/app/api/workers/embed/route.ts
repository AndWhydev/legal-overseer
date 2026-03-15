/**
 * Embedding Queue Worker Endpoint
 *
 * POST /api/workers/embed
 *
 * Processes pending embedding jobs from the queue.
 * Called by Cloudflare Cron (every 5 minutes) or triggered by Fly.io worker.
 *
 * Authentication:
 * - Requires WORKER_AUTH_TOKEN header matching env variable
 * - Returns 401 if token is invalid or missing
 *
 * Response:
 * {
 *   processed: number,
 *   completed: number,
 *   failed: number,
 *   queueDepth: number,
 *   errors: string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { processEmbeddingQueue, getQueueStats, clearStaleJobs } from '@/lib/rag/embedding-queue'

const BATCH_SIZE = 10
const STALE_THRESHOLD_MS = 3600000 // 1 hour

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Validate worker authentication token
    const authHeader = req.headers.get('Authorization') || req.headers.get('X-Auth-Token') || ''
    const expectedToken = process.env.WORKER_AUTH_TOKEN

    if (!expectedToken) {
      logger.error('[embed-worker] WORKER_AUTH_TOKEN not configured')
      return NextResponse.json(
        { error: 'Worker token not configured' },
        { status: 500 }
      )
    }

    // Extract token from "Bearer {token}" or direct token
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || authHeader

    if (!token || token !== expectedToken) {
      logger.warn('[embed-worker] Invalid authentication token')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Initialize Supabase service client
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      logger.error('[embed-worker] Supabase credentials not configured')
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    })

    // Clear any stale jobs before processing
    await clearStaleJobs(supabase, STALE_THRESHOLD_MS)

    // Process next batch of embedding jobs
    const result = await processEmbeddingQueue(supabase, BATCH_SIZE)

    // Get current queue stats
    const stats = await getQueueStats(supabase)

    logger.info('[embed-worker] Processing complete', {
      processed: result.processed,
      completed: result.completed,
      failed: result.failed,
      queueDepth: stats.queueDepth,
    })

    return NextResponse.json(
      {
        processed: result.processed,
        completed: result.completed,
        failed: result.failed,
        queueDepth: stats.queueDepth,
        processingCount: stats.processingCount,
        failedCount: stats.failedCount,
        averageProcessingTimeMs: Math.round(stats.averageProcessingTimeMs),
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { status: 200 }
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('[embed-worker] Unhandled exception:', err)

    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    )
  }
}

/**
 * GET /api/workers/embed - Health check and stats
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Validate worker authentication token
    const authHeader = req.headers.get('Authorization') || req.headers.get('X-Auth-Token') || ''
    const expectedToken = process.env.WORKER_AUTH_TOKEN
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || authHeader

    if (!expectedToken || !token || token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Initialize Supabase service client
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    })

    // Get queue statistics
    const stats = await getQueueStats(supabase)

    return NextResponse.json(
      {
        status: 'healthy',
        queueDepth: stats.queueDepth,
        processing: stats.processingCount,
        failed: stats.failedCount,
        completedToday: stats.completedToday,
        averageProcessingTimeMs: Math.round(stats.averageProcessingTimeMs),
      },
      { status: 200 }
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('[embed-worker] Stats endpoint error:', err)

    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    )
  }
}
