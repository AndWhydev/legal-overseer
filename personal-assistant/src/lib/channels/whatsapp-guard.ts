/**
 * WhatsApp Gateway Guards
 *
 * - Per-number inbound rate limiting (token bucket, in-memory)
 * - Org-level send quota enforcement
 */

import { logger } from '@/lib/core/logger'
import { checkSendLimit, incrementSendCount } from '@/lib/agent/send-limits'
import type { SupabaseClient } from '@supabase/supabase-js'

interface RateBucket {
  tokens: number
  lastRefill: number
}

const RATE_LIMIT = {
  maxTokens: 10,
  refillRate: 5,
  refillInterval: 60_000,
} as const

const inboundBuckets = new Map<string, RateBucket>()

// Unref so the cleanup interval never holds the event loop open (matters on
// worker runtimes; no-op on serverless where the instance dies anyway).
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [key, bucket] of inboundBuckets) {
    if (bucket.lastRefill < cutoff) inboundBuckets.delete(key)
  }
}, 10 * 60 * 1000)
cleanupTimer.unref?.()

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

  const elapsed = now - bucket.lastRefill
  const refill = Math.floor(elapsed / RATE_LIMIT.refillInterval) * RATE_LIMIT.refillRate
  if (refill > 0) {
    bucket.tokens = Math.min(RATE_LIMIT.maxTokens, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  if (bucket.tokens <= 0) {
    logger.warn('[whatsapp-guard] Rate limited', { phone })
    return true
  }

  bucket.tokens--
  return false
}

// ── Send Quota ──────────────────────────────────────────────────────────────

/**
 * Check org-level WhatsApp send quota before responding.
 * Returns true if sending is allowed.
 */
export async function checkWhatsAppQuota(
  supabase: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  try {
    const result = await checkSendLimit(supabase, orgId, 'whatsapp')
    if (!result.allowed) {
      logger.warn('[whatsapp-guard] WhatsApp quota exceeded', { orgId, remaining: result.remaining })
    }
    return result.allowed
  } catch (err) {
    logger.warn('[whatsapp-guard] Quota check failed, allowing', { err })
    return true
  }
}

/**
 * Increment org WhatsApp send counter after successful send.
 */
export async function trackWhatsAppSend(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  try {
    await incrementSendCount(supabase, orgId, 'whatsapp')
  } catch (err) {
    logger.warn('[whatsapp-guard] Failed to track WhatsApp send', { err })
  }
}
