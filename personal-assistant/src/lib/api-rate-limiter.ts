/**
 * Request-level rate limiter for API endpoints.
 * Uses in-memory sliding window per IP. Suitable for single-instance deployments.
 * For multi-instance, migrate to Redis (see task #17).
 *
 * NOTE: This rate limiter uses an in-memory Map, which does not persist across
 * Vercel serverless instances. Acceptable for MVP; migrate to Upstash Redis
 * for production scale.
 */

import { NextResponse } from 'next/server'
import { logger } from '@/lib/core/logger'

interface WindowEntry {
  timestamps: number[]
}

const windows = new Map<string, WindowEntry>()

// Cleanup stale entries every 60s to prevent unbounded memory growth
let cleanupHandle: NodeJS.Timeout | null = null
function scheduleCleanup() {
  if (cleanupHandle) return

  cleanupHandle = setInterval(() => {
    const cutoff = Date.now() - 120_000
    let deleted = 0
    for (const [key, entry] of windows) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff)
      if (entry.timestamps.length === 0) {
        windows.delete(key)
        deleted++
      }
    }
    if (deleted > 0) {
      logger.debug(`[rate-limiter] Cleaned up ${deleted} stale entries`)
    }
  }, 60_000)

  // Allow process to exit even if cleanup interval is running
  if (typeof cleanupHandle.unref === 'function') {
    cleanupHandle.unref()
  }
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
  /** General API — generous for dashboard with many concurrent tab fetches */
  api: { maxRequests: 120, windowMs: 60_000 },
  /** Chat/SSE endpoints — must never be blocked by background tab fetches */
  chat: { maxRequests: 30, windowMs: 60_000 },
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

/** Per-user endpoint rate limits (keyed by `${userId}:${endpoint}`) */
export const USER_ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  '/api/ai/text': { maxRequests: 10, windowMs: 60_000 },
  '/api/ai/voice': { maxRequests: 5, windowMs: 60_000 },
  '/api/agent/chat': { maxRequests: 10, windowMs: 60_000 },
  '/api/account/delete': { maxRequests: 3, windowMs: 3_600_000 },
  '/api/billing/checkout': { maxRequests: 10, windowMs: 3_600_000 },
  '/api/org/invite': { maxRequests: 10, windowMs: 3_600_000 },
  '/api/voice/session': { maxRequests: 10, windowMs: 60_000 },
  '/api/voice/stream': { maxRequests: 20, windowMs: 60_000 },
  // Telegram onboarding pairing: 5 codes per 5 min per user. Prevents
  // accidental DB write amplification if the UI retries and keeps the
  // user from locking themselves out.
  '/api/bridges/telegram/pair': { maxRequests: 5, windowMs: 300_000 },
}

/**
 * Check per-user rate limit for a specific endpoint.
 * Returns a 429 NextResponse if rate limited, or null if allowed.
 */
export function checkUserEndpointLimit(userId: string, endpoint: string): NextResponse | null {
  const config = USER_ENDPOINT_LIMITS[endpoint]
  if (!config) return null

  const result = checkApiRateLimit(`user:${userId}:${endpoint}`, config)
  if (result.allowed) return null

  logger.warn(`[rate-limiter] User ${userId} rate limited on ${endpoint}`, {
    endpoint,
    resetMs: result.resetMs,
  })

  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(result.resetMs / 1000)),
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
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
  if (pathname.startsWith('/api/channels/') || pathname.startsWith('/api/webhooks/')) {
    return RATE_LIMIT_TIERS.webhook
  }
  // Chat SSE gets its own rate limit bucket so dashboard tab fetches can't block it
  if (pathname.startsWith('/api/agent/chat')) {
    return RATE_LIMIT_TIERS.chat
  }
  return RATE_LIMIT_TIERS.api
}
