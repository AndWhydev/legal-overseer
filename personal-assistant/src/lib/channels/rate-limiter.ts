import type { ChannelType } from './types'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Per-channel rate limiter using token bucket algorithm
// Backed by Supabase for persistence across cold starts, with in-memory fallback
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

// In-memory fallback when Supabase is unavailable
const memBuckets = new Map<string, BucketState>()
const configs = new Map<string, BucketConfig>()

let supabaseClient: SupabaseClient | null = null
let supabaseAvailable: boolean | null = null

function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    supabaseAvailable = false
    return null
  }
  supabaseClient = createClient(url, key)
  return supabaseClient
}

function buildBucketKey(channel: ChannelType, orgId?: string): string {
  return orgId ? `${orgId}:${channel}` : channel
}

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

function refillInMemory(key: string, config: BucketConfig): BucketState {
  const now = Date.now()
  const state = memBuckets.get(key) || { tokens: config.maxTokens, lastRefill: now }

  const elapsed = (now - state.lastRefill) / 1000
  const newTokens = Math.min(config.maxTokens, state.tokens + elapsed * config.refillRate)

  const updated: BucketState = { tokens: newTokens, lastRefill: now }
  memBuckets.set(key, updated)
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
 * Consumes one token if allowed. Uses Supabase for persistence,
 * falls back to in-memory if unavailable.
 *
 * @param channel - Channel type
 * @param orgId - Optional org ID for per-org rate limiting
 */
export async function checkRateLimit(
  channel: ChannelType,
  orgId?: string,
): Promise<RateLimitResult> {
  const config = getConfig(channel)
  const key = buildBucketKey(channel, orgId)

  const db = getSupabase()
  if (db && supabaseAvailable !== false) {
    try {
      return await checkRateLimitDb(db, key, config)
    } catch (err) {
      // Mark Supabase as unavailable and fall back to in-memory
      console.warn('[rate-limiter] Supabase unavailable, falling back to in-memory:', err)
      supabaseAvailable = false
    }
  }

  return checkRateLimitMem(key, config)
}

async function checkRateLimitDb(
  db: SupabaseClient,
  key: string,
  config: BucketConfig,
): Promise<RateLimitResult> {
  const now = new Date()

  // Upsert + refill in one query
  const { data: existing } = await db
    .from('rate_limit_buckets')
    .select('tokens, last_refill')
    .eq('bucket_key', key)
    .single()

  let tokens: number
  if (existing) {
    const elapsed = (now.getTime() - new Date(existing.last_refill).getTime()) / 1000
    tokens = Math.min(config.maxTokens, existing.tokens + elapsed * config.refillRate)
  } else {
    tokens = config.maxTokens
  }

  if (tokens >= 1) {
    tokens -= 1
    await db.from('rate_limit_buckets').upsert({
      bucket_key: key,
      tokens,
      max_tokens: config.maxTokens,
      refill_rate: config.refillRate,
      last_refill: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'bucket_key' })

    return { allowed: true, waitMs: 0, remaining: Math.floor(tokens) }
  }

  const waitMs = Math.ceil((1 - tokens) / config.refillRate * 1000)
  return { allowed: false, waitMs, remaining: 0 }
}

function checkRateLimitMem(key: string, config: BucketConfig): RateLimitResult {
  const state = refillInMemory(key, config)

  if (state.tokens >= 1) {
    state.tokens -= 1
    memBuckets.set(key, state)
    return { allowed: true, waitMs: 0, remaining: Math.floor(state.tokens) }
  }

  const waitMs = Math.ceil((1 - state.tokens) / config.refillRate * 1000)
  return { allowed: false, waitMs, remaining: 0 }
}

/**
 * Wait for rate limit clearance, then proceed.
 * Returns immediately if under limit.
 *
 * @param channel - Channel type
 * @param orgId - Optional org ID for per-org rate limiting
 */
export async function waitForRateLimit(channel: ChannelType, orgId?: string): Promise<void> {
  const result = await checkRateLimit(channel, orgId)
  if (result.allowed) return

  await new Promise(resolve => setTimeout(resolve, result.waitMs))
  // Consume token after waiting
  await checkRateLimit(channel, orgId)
}

/**
 * Reset rate limit state for a channel (useful for testing).
 */
export function resetRateLimit(channel: ChannelType): void {
  memBuckets.delete(channel)
  configs.delete(channel)
}

/**
 * Clean up expired rate limit buckets (buckets not updated in the last hour).
 * Call this from a cron job or periodic cleanup.
 */
export async function cleanupExpiredBuckets(): Promise<number> {
  const db = getSupabase()
  if (!db || supabaseAvailable === false) return 0

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await db
    .from('rate_limit_buckets')
    .delete({ count: 'exact' })
    .lt('updated_at', cutoff)

  if (error) {
    console.error('[rate-limiter] Failed to cleanup expired buckets:', error.message)
    return 0
  }

  return count ?? 0
}
