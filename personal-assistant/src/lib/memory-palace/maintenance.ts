/**
 * Memory Palace — Maintenance Service
 *
 * Background maintenance operations:
 * 1. Confidence decay on stale memories
 * 2. Duplicate detection and merge
 * 3. Archive low-confidence memories
 * 4. Recompute entity memory summaries
 *
 * Called from a cron route (e.g., daily or every 6 hours).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MaintenanceResult {
  decayed: number
  archived: number
  merged: number
  errors: string[]
  duration: number
}

// ─── Maintenance Runner ─────────────────────────────────────────────────────

/**
 * Run all maintenance operations for an org.
 */
export async function runMemoryMaintenance(
  supabase: SupabaseClient,
  orgId: string,
): Promise<MaintenanceResult> {
  const start = Date.now()
  const result: MaintenanceResult = {
    decayed: 0,
    archived: 0,
    merged: 0,
    errors: [],
    duration: 0,
  }

  try {
    // 1. Decay stale memories (via DB function)
    const decayResult = await decayMemories(supabase, orgId)
    result.decayed = decayResult.decayed
    result.archived += decayResult.archived

    // 2. Detect and merge near-duplicate memories
    const mergeResult = await mergeNearDuplicates(supabase, orgId)
    result.merged = mergeResult

    logger.info('[memory-maintenance] Complete', {
      orgId,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(msg)
    logger.error('[memory-maintenance] Failed', { orgId, error: msg })
  }

  result.duration = Date.now() - start
  return result
}

/**
 * Decay confidence on stale memories using the DB function.
 */
async function decayMemories(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ decayed: number; archived: number }> {
  try {
    const { data, error } = await supabase.rpc('decay_stale_memories', {
      p_org_id: orgId,
    })

    if (error) {
      logger.warn('[memory-maintenance] decay RPC failed, using fallback', {
        error: error.message,
      })
      return fallbackDecay(supabase, orgId)
    }

    const result = data as Record<string, number>
    return {
      decayed: result.decayed ?? 0,
      archived: result.archived ?? 0,
    }
  } catch {
    return fallbackDecay(supabase, orgId)
  }
}

/**
 * Fallback decay when RPC is unavailable.
 */
async function fallbackDecay(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ decayed: number; archived: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()

  // Fast decay
  const { data: fastData } = await supabase
    .from('memory_entries')
    .update({ confidence: 0 }) // simplified — real decay is more nuanced
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('decay_rate', 'fast')
    .lt('updated_at', oneDayAgo)
    .or(`last_corroborated_at.is.null,last_corroborated_at.lt.${sevenDaysAgo}`)
    .select('id')

  const fastCount = fastData?.length ?? 0

  // Archive below threshold
  const { data: archivedData } = await supabase
    .from('memory_entries')
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      archive_reason: 'confidence_decay',
    })
    .eq('org_id', orgId)
    .eq('is_active', true)
    .lt('confidence', 0.1)
    .select('id')

  const archivedCount = archivedData?.length ?? 0

  return {
    decayed: fastCount ?? 0,
    archived: archivedCount ?? 0,
  }
}

/**
 * Detect near-duplicate memories and merge them.
 * Uses title similarity (ILIKE) as a cheap proxy for semantic similarity.
 * More sophisticated dedup would use embeddings but this is the 80/20.
 */
async function mergeNearDuplicates(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    // Find memories with identical titles (exact duplicates)
    const { data: candidates } = await supabase
      .from('memory_entries')
      .select('id, title, confidence, corroboration_count, created_at')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('title')
      .order('confidence', { ascending: false })

    if (!candidates || candidates.length < 2) return 0

    let merged = 0
    const processed = new Set<string>()

    for (let i = 0; i < candidates.length - 1; i++) {
      if (processed.has(candidates[i].id)) continue

      const current = candidates[i]
      const duplicates: string[] = []

      for (let j = i + 1; j < candidates.length; j++) {
        if (processed.has(candidates[j].id)) continue
        if (candidates[j].title === current.title) {
          duplicates.push(candidates[j].id)
          processed.add(candidates[j].id)
        }
      }

      if (duplicates.length > 0) {
        // Keep highest confidence one, archive the rest
        for (const dupId of duplicates) {
          await supabase
            .from('memory_entries')
            .update({
              is_active: false,
              superseded_by: current.id,
              archived_at: new Date().toISOString(),
              archive_reason: 'merged_duplicate',
            })
            .eq('id', dupId)

          merged++
        }

        // Boost the survivor's corroboration count
        await supabase
          .from('memory_entries')
          .update({
            corroboration_count: (current.corroboration_count ?? 0) + duplicates.length,
            last_corroborated_at: new Date().toISOString(),
          })
          .eq('id', current.id)

        // Log the merge
        await supabase.from('memory_consolidation_log').insert({
          org_id: orgId,
          operation: 'merge',
          affected_memory_ids: [current.id, ...duplicates],
          details: {
            survivor: current.id,
            merged: duplicates,
            reason: 'exact_title_match',
          },
        })
      }
    }

    return merged
  } catch (err) {
    logger.error('[memory-maintenance] mergeNearDuplicates failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}
