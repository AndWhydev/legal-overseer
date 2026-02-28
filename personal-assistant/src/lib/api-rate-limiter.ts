/**
 * Request-level rate limiter for API endpoints.
 * Uses in-memory sliding window per IP. Suitable for single-instance deployments.
 * For multi-instance, migrate to Redis (see task #17).
 */

interface WindowEntry {
  timestamps: number[]
}

const windows = new Map<string, WindowEntry>()

// Cleanup stale entries every 60s
let cleanupScheduled = false
function scheduleCleanup() {
  if (cleanupScheduled) return
  cleanupScheduled = true
  setInterval(() => {
    const cutoff = Date.now() - 120_000
    for (const [key, entry] of windows) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff)
      if (entry.timestamps.length === 0) windows.delete(key)
    }
  }, 60_000)
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number
  /** Window size in milliseconds */
  windowMs: number
}

/** Default tiers for different endpoint categories */
export const RATE_LIMIT_TIERS: Record<string, RateLimitConfig> = {
  /** Auth endpoints — tight to prevent brute force */
  auth: { maxRequests: 10, windowMs: 60_000 },
  /** Cron endpoints — very tight, only legitimate cron should call */
  cron: { maxRequests: 5, windowMs: 60_000 },
  /** General API — reasonable default */
  api: { maxRequests: 60, windowMs: 60_000 },
  /** Webhook endpoints — higher limit for platform callbacks */
  webhook: { maxRequests: 200, windowMs: 60_000 },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
}

/**
 * Check rate limit for a given key (typically IP + route category).
 */
export function checkApiRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  scheduleCleanup()

  const now = Date.now()
  const cutoff = now - config.windowMs

  let entry = windows.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    windows.set(key, entry)
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff)

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0]
    const resetMs = oldest + config.windowMs - now
    return { allowed: false, remaining: 0, resetMs }
  }

  entry.timestamps.push(now)
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: config.windowMs,
  }
}

/**
 * Determine rate limit tier from a pathname.
 */
export function getTierForPath(pathname: string): RateLimitConfig {
  if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/login')) {
    return RATE_LIMIT_TIERS.auth
  }
  if (pathname.startsWith('/api/cron/')) {
    return RATE_LIMIT_TIERS.cron
  }
  if (pathname.startsWith('/api/channels/')) {
    return RATE_LIMIT_TIERS.webhook
  }
  return RATE_LIMIT_TIERS.api
}
