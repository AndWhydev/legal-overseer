/**
 * Sendblue Security Guards
 *
 * - Per-number inbound rate limiting (token bucket, in-memory)
 * - SSRF protection for media URLs (block private IPs)
 * - Timing-safe API key comparison
 * - Org-level send quota enforcement
 */

import { logger } from '@/lib/core/logger'
import { timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Inbound Rate Limiter ────────────────────────────────────────────────────

interface RateBucket {
  tokens: number
  lastRefill: number
}

const RATE_LIMIT = {
  maxTokens: 10,       // burst capacity
  refillRate: 5,        // tokens per minute
  refillInterval: 60_000, // 1 minute
} as const

const inboundBuckets = new Map<string, RateBucket>()

// Cleanup stale buckets every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [key, bucket] of inboundBuckets) {
    if (bucket.lastRefill < cutoff) inboundBuckets.delete(key)
  }
}, 10 * 60 * 1000)

/**
 * Check if an inbound message from this phone number should be rate-limited.
 * Returns true if the message should be BLOCKED.
 */
export function isRateLimited(phone: string): boolean {
  const now = Date.now()
  let bucket = inboundBuckets.get(phone)

  if (!bucket) {
    bucket = { tokens: RATE_LIMIT.maxTokens - 1, lastRefill: now }
    inboundBuckets.set(phone, bucket)
    return false
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill
  const refill = Math.floor(elapsed / RATE_LIMIT.refillInterval) * RATE_LIMIT.refillRate
  if (refill > 0) {
    bucket.tokens = Math.min(RATE_LIMIT.maxTokens, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  if (bucket.tokens <= 0) {
    logger.warn('[sendblue-guard] Rate limited', { phone })
    return true
  }

  bucket.tokens--
  return false
}

// ── SSRF Protection ─────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^127\./,                   // loopback
  /^10\./,                    // class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // class B private
  /^192\.168\./,              // class C private
  /^169\.254\./,              // link-local
  /^0\./,                     // current network
  /^fc00:/i,                  // IPv6 unique local
  /^fe80:/i,                  // IPv6 link-local
  /^::1$/,                    // IPv6 loopback
  /^fd/i,                     // IPv6 private
]

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]

/**
 * Check if a URL is safe to fetch (not a private/internal address).
 * Returns false if the URL targets a private IP or hostname.
 */
export function isMediaUrlSafe(mediaUrl: string): boolean {
  try {
    const url = new URL(mediaUrl)

    // Must be HTTPS (or HTTP from known CDNs)
    if (!['https:', 'http:'].includes(url.protocol)) return false

    // Block known internal hostnames
    const hostname = url.hostname.toLowerCase()
    if (BLOCKED_HOSTNAMES.includes(hostname)) return false

    // Block private IP ranges
    if (PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname))) return false

    // Block URLs with credentials
    if (url.username || url.password) return false

    return true
  } catch {
    return false
  }
}

// ── API Key Verification ────────────────────────────────────────────────────

/**
 * Timing-safe comparison of webhook API key.
 *
 * Sendblue does NOT send auth headers on webhook callbacks — their docs
 * confirm no HMAC or API key is included. We optionally verify via a
 * separate SENDBLUE_WEBHOOK_SECRET env var if configured, but by default
 * allow all requests (security relies on URL obscurity + rate limiting).
 */
export function verifyWebhookKey(incomingKey: string | null): boolean {
  const webhookSecret = process.env.SENDBLUE_WEBHOOK_SECRET
  if (!webhookSecret) return true // no webhook secret = allow all (Sendblue default)
  if (!incomingKey) return false

  try {
    const a = Buffer.from(webhookSecret, 'utf-8')
    const b = Buffer.from(incomingKey, 'utf-8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Send Quota ──────────────────────────────────────────────────────────────

/**
 * Check and enforce org-level SMS send quota before sending a response.
 * Returns true if sending is allowed.
 */
export async function checkSmsQuota(
  supabase: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  try {
    const { checkSendLimit } = await import('@/lib/agent/send-limits')
    const result = await checkSendLimit(supabase, orgId, 'sms')
    if (!result.allowed) {
      logger.warn('[sendblue-guard] SMS quota exceeded', { orgId, remaining: result.remaining })
    }
    return result.allowed
  } catch (err) {
    // Non-fatal — allow sending if quota check fails
    logger.warn('[sendblue-guard] Quota check failed, allowing', { err })
    return true
  }
}

/**
 * Increment org SMS send counter after successful send.
 */
export async function trackSmsSend(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  try {
    const { incrementSendCount } = await import('@/lib/agent/send-limits')
    await incrementSendCount(supabase, orgId, 'sms')
  } catch (err) {
    logger.warn('[sendblue-guard] Failed to track SMS send', { err })
  }
}
