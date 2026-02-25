import type { ChannelType } from './types'

// ---------------------------------------------------------------------------
// Per-channel rate limiter using token bucket algorithm
// ---------------------------------------------------------------------------

interface BucketConfig {
  /** Maximum requests allowed per window */
  maxTokens: number
  /** Refill rate: tokens added per second */
  refillRate: number
}

interface BucketState {
  tokens: number
  lastRefill: number
}

/** Default rate limits per channel (requests per minute) */
const DEFAULT_LIMITS: Partial<Record<ChannelType, number>> = {
  gmail: 60,
  outlook: 120,
  asana: 150,
  calendly: 60,
  stripe: 100,
  whatsapp: 80,
  gsc: 30,
}

const buckets = new Map<string, BucketState>()
const configs = new Map<string, BucketConfig>()

/**
 * Configure rate limit for a specific channel.
 * @param channel - Channel type
 * @param requestsPerMinute - Max requests per minute
 */
export function configureRateLimit(channel: ChannelType, requestsPerMinute: number): void {
  configs.set(channel, {
    maxTokens: requestsPerMinute,
    refillRate: requestsPerMinute / 60,
  })
}

function getConfig(channel: ChannelType): BucketConfig {
  const existing = configs.get(channel)
  if (existing) return existing

  const rpm = DEFAULT_LIMITS[channel] || 60
  const config: BucketConfig = { maxTokens: rpm, refillRate: rpm / 60 }
  configs.set(channel, config)
  return config
}

function refillBucket(channel: ChannelType): BucketState {
  const config = getConfig(channel)
  const now = Date.now()
  const state = buckets.get(channel) || { tokens: config.maxTokens, lastRefill: now }

  const elapsed = (now - state.lastRefill) / 1000
  const newTokens = Math.min(config.maxTokens, state.tokens + elapsed * config.refillRate)

  const updated: BucketState = { tokens: newTokens, lastRefill: now }
  buckets.set(channel, updated)
  return updated
}

export interface RateLimitResult {
  allowed: boolean
  /** Milliseconds to wait before retrying (0 if allowed) */
  waitMs: number
  /** Remaining tokens in bucket */
  remaining: number
}

/**
 * Check if a request is allowed under the rate limit for a channel.
 * Consumes one token if allowed.
 */
export function checkRateLimit(channel: ChannelType): RateLimitResult {
  const state = refillBucket(channel)
  const config = getConfig(channel)

  if (state.tokens >= 1) {
    state.tokens -= 1
    buckets.set(channel, state)
    return { allowed: true, waitMs: 0, remaining: Math.floor(state.tokens) }
  }

  // Calculate wait time until one token is available
  const waitMs = Math.ceil((1 - state.tokens) / config.refillRate * 1000)
  return { allowed: false, waitMs, remaining: 0 }
}

/**
 * Wait for rate limit clearance, then proceed.
 * Returns immediately if under limit.
 */
export async function waitForRateLimit(channel: ChannelType): Promise<void> {
  const result = checkRateLimit(channel)
  if (result.allowed) return

  await new Promise(resolve => setTimeout(resolve, result.waitMs))
  // Consume token after waiting
  const state = refillBucket(channel)
  state.tokens = Math.max(0, state.tokens - 1)
  buckets.set(channel, state)
}

/**
 * Reset rate limit state for a channel (useful for testing).
 */
export function resetRateLimit(channel: ChannelType): void {
  buckets.delete(channel)
  configs.delete(channel)
}
