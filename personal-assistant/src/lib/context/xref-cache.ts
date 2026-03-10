import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

interface CacheEntry {
  cache_type: string
  cache_data: Record<string, unknown>
  computed_at: string
  valid_until: string
}

/**
 * Get cached cross-references for an entity.
 * Falls back to live computation if cache is stale/missing.
 */
export async function getCachedCrossRefs(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  cacheType: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('cross_reference_cache')
    .select('cache_data, valid_until')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('cache_type', cacheType)
    .single()

  if (!data) return null

  // Check if cache is still valid
  if (new Date(data.valid_until) < new Date()) {
    logger.debug('[xref-cache] Cache expired', { entityType, entityId, cacheType })
    return null
  }

  return data.cache_data as Record<string, unknown>
}

/**
 * Write cross-reference cache entry.
 * Uses upsert with 15-minute TTL.
 */
export async function setCachedCrossRefs(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  cacheType: string,
  data: Record<string, unknown>,
  ttlMinutes = 15
): Promise<void> {
  const validUntil = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('cross_reference_cache')
    .upsert({
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      cache_type: cacheType,
      cache_data: data,
      computed_at: new Date().toISOString(),
      valid_until: validUntil,
    }, {
      onConflict: 'org_id,entity_type,entity_id,cache_type'
    })

  if (error) {
    logger.error('[xref-cache] Failed to write cache', { error: error.message })
  }
}

/**
 * Invalidate cache entries for an entity (call after entity updates).
 */
export async function invalidateCrossRefs(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string
): Promise<void> {
  const { error } = await supabase
    .from('cross_reference_cache')
    .delete()
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)

  if (error) {
    logger.error('[xref-cache] Failed to invalidate cache', { error: error.message })
  }
}
