/**
 * Upstash Redis Client Wrapper
 *
 * Returns a singleton Redis client when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set.  Returns null gracefully when Redis
 * is not configured — all callers must handle the null case.
 *
 * Uses @upstash/redis which communicates over HTTP REST (no TCP socket),
 * making it safe in serverless / edge environments.
 */

import { Redis } from '@upstash/redis'
import { logger } from '@/lib/core/logger'

// ─── Singleton ───────────────────────────────────────────────────────────────

let _client: Redis | null = null
let _initialized = false

/**
 * Get the Redis singleton.
 * Returns null if UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set,
 * or if the initial connection probe failed.
 */
export function getRedis(): Redis | null {
  if (_initialized) return _client

  _initialized = true

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    logger.debug('[redis] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory fallback')
    _client = null
    return null
  }

  try {
    _client = new Redis({ url, token })
    logger.info('[redis] Upstash Redis client initialised', { url })
  } catch (err) {
    logger.warn('[redis] Failed to initialise Redis client, falling back to in-memory:', err)
    _client = null
  }

  return _client
}

/**
 * Reset singleton (for testing only).
 * @internal
 */
export function _resetRedisClient(): void {
  _client = null
  _initialized = false
}
