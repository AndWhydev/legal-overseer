import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

const DAILY_LIMITS = {
  email: 50,
  sms: 20,
  whatsapp: 20,
} as const

type SendChannel = keyof typeof DAILY_LIMITS

/**
 * Check if the org has remaining send budget for today.
 * Uses rate_limit_buckets table with key pattern: `send:{channel}:{orgId}:{YYYY-MM-DD}`
 */
export async function checkSendLimit(
  supabase: SupabaseClient,
  orgId: string,
  channel: SendChannel
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const today = new Date().toISOString().split('T')[0]
  const bucketKey = `send:${channel}:${orgId}:${today}`
  const limit = DAILY_LIMITS[channel]

  const { data } = await supabase
    .from('rate_limit_buckets')
    .select('tokens')
    .eq('bucket_key', bucketKey)
    .single()

  const used = data?.tokens ?? 0
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit }
}

/**
 * Increment the daily send counter for an org+channel.
 * Creates the bucket row if it doesn't exist (upsert).
 */
export async function incrementSendCount(
  supabase: SupabaseClient,
  orgId: string,
  channel: SendChannel
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const bucketKey = `send:${channel}:${orgId}:${today}`

  // Upsert: increment if exists, create with 1 if not
  const { error } = await supabase.rpc('increment_rate_limit', {
    p_key: bucketKey,
    p_increment: 1,
  })

  if (error) {
    // Fallback: try manual upsert if RPC doesn't exist
    logger.warn('[send-limits] RPC increment failed, using manual upsert:', error.message)
    const { data: existing } = await supabase
      .from('rate_limit_buckets')
      .select('tokens')
      .eq('bucket_key', bucketKey)
      .single()

    if (existing) {
      await supabase
        .from('rate_limit_buckets')
        .update({ tokens: existing.tokens + 1 })
        .eq('bucket_key', bucketKey)
    } else {
      await supabase
        .from('rate_limit_buckets')
        .insert({ bucket_key: bucketKey, tokens: 1, max_tokens: 100, refill_rate: 0 })
    }
  }
}
