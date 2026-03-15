/**
 * Sliding Window Rate Limiter
 *
 * Primary backend: Upstash Redis (INCR + EXPIRE sliding window).
 * Fallback: in-memory Map when Redis is unavailable or not configured.
 *
 * Usage:
 *   const result = await checkRateLimit('rag:search:orgId', 60, 60)
 *   if (!result.allowed) return res.status(429).json({ error: 'Rate limit exceeded' })
 *
 * Integration point: wire into Next.js API route middleware or individual
 * route handlers for RAG search, embedding, and other high-frequency endpoints.
 */

import { getRedis } from './redis'
import { logger } from '@/lib/core/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Requests remaining in current window */
  remaining: number
  /** Unix timestamp (ms) when the window resets */
  resetAt: number
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────

interface MemoryBucket {
  count: number
  windowStart: number
}

// Max 10,000 in-memory buckets to avoid unbounded growth
const MEM_MAX_SIZE = 10_000
const memBuckets = new Map<string, MemoryBucket>()

function checkRateLimitMem(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  const bucket = memBuckets.get(key)
  const windowStart = bucket && now - bucket.windowStart < windowMs
    ? bucket.windowStart
    : now

  const count = bucket && now - bucket.windowStart < windowMs ? bucket.count : 0
  const newCount = count + 1
  const resetAt = windowStart + windowMs

  if (newCount <= limit) {
    // Evict oldest entry if at capacity (rough LRU — just delete first key)
    if (!bucket && memBuckets.size >= MEM_MAX_SIZE) {
      const firstKey = memBuckets.keys().next().value
      if (firstKey !== undefined) memBuckets.delete(firstKey)
    }
    memBuckets.set(key, { count: newCount, windowStart })
    return { allowed: true, remaining: limit - newCount, resetAt }
  }

  return { allowed: false, remaining: 0, resetAt }
}

// ─── Redis Sliding Window ─────────────────────────────────────────────────────

async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis()
  if (!redis) {
    return checkRateLimitMem(key, limit, windowSeconds)
  }

  const redisKey = `rl:${key}`
  const now = Date.now()
  const resetAt = now + windowSeconds * 1000

  try {
    // Pipeline: INCR + EXPIRE in a single round-trip
    const pipeline = redis.pipeline()
    pipeline.incr(redisKey)
    pipeline.expire(redisKey, windowSeconds)
    const [count] = (await pipeline.exec()) as [number, number]

    if (count <= limit) {
      return { allowed: true, remaining: limit - count, resetAt }
    }

    return { allowed: false, remaining: 0, resetAt }
  } catch (err) {
    logger.warn('[rate-limiter] Redis error, falling back to in-memory:', err)
    return checkRateLimitMem(key, limit, windowSeconds)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * Uses a sliding window approximation:
 * - Redis: INCR + EXPIRE (resets counter after `windowSeconds`)
 * - Fallback: in-memory Map with window start tracking
 *
 * @param key           Unique rate limit identifier (e.g. `rag:search:${orgId}`)
 * @param limit         Max requests allowed per window
 * @param windowSeconds Window size in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  return checkRateLimitRedis(key, limit, windowSeconds)
}

/**
 * Reset in-memory rate limit state for a key (for testing only).
 * @internal
 */
export function _resetMemBucket(key: string): void {
  memBuckets.delete(key)
}

/**
 * Clear all in-memory buckets (for testing only).
 * @internal
 */
export function _clearMemBuckets(): void {
  memBuckets.clear()
}
