/**
 * Memory Palace Consolidation Pipeline — Background process that:
 * 1. Decays stale memories (confidence reduction over time)
 * 2. Merges corroborating facts (dedup + strengthen)
 * 3. Promotes high-confidence patterns to memories
 * 4. Archives low-signal memories
 *
 * Designed to run as a periodic job (cron or edge function).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { MemoryPattern, MemoryPalaceEntry } from './types'
import { MemoryWriter } from './memory-writer'

// ─── Constants ───────────────────────────────────────────────────────────────

const PROMOTION_CONFIDENCE_THRESHOLD = 0.75
const ARCHIVE_CONFIDENCE_THRESHOLD = 0.1
const MERGE_SIMILARITY_THRESHOLD = 0.75
const DECAY_BATCH_SIZE = 200

// ─── Consolidation Pipeline ─────────────────────────────────────────────────

export class ConsolidationPipeline {
  private writer: MemoryWriter

  constructor(private supabase: SupabaseClient) {
    this.writer = new MemoryWriter(supabase)
  }

  /**
   * Run the full consolidation cycle for an org.
   * Returns a summary of actions taken.
   */
  async runForOrg(orgId: string): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      orgId,
      decayed: 0,
      merged: 0,
      promoted: 0,
      archived: 0,
      startedAt: new Date().toISOString(),
      completedAt: '',
    }

    try {
      // 1. Apply confidence decay
      report.decayed = await this.applyDecay(orgId)

      // 2. Merge corroborating memories
      report.merged = await this.mergeDuplicates(orgId)

      // 3. Promote high-confidence patterns to memories
      report.promoted = await this.promotePatterns(orgId)

      // 4. Archive low-confidence memories
      report.archived = await this.archiveLowConfidence(orgId)

      report.completedAt = new Date().toISOString()

      logger.info('[consolidation-pipeline] Cycle completed', report)
    } catch (err) {
      logger.error('[consolidation-pipeline] Cycle failed', {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      })
      report.completedAt = new Date().toISOString()
    }

    return report
  }

  /**
   * Apply confidence decay using the database function.
   */
  private async applyDecay(orgId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('decay_memory_confidence', {
      p_org_id: orgId,
      p_batch_size: DECAY_BATCH_SIZE,
    })

    if (error) {
      logger.warn('[consolidation-pipeline] Decay RPC failed', { error: error.message })
      return 0
    }

    return (data as number) ?? 0
  }

  /**
   * Find and merge semantically similar memories.
   * Keeps the highest-confidence version and corroborates it.
   */
  private async mergeDuplicates(orgId: string): Promise<number> {
    let merged = 0

    // Load active memories in batches, grouped by category
    const categories = ['fact', 'relationship', 'pricing', 'convention'] as const

    for (const category of categories) {
      const { data: memories } = await this.supabase
        .from('memory_palace_entries')
        .select('id, content, confidence, entity_ids, corroboration_count')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .eq('category', category)
        .order('confidence', { ascending: false })
        .limit(100)

      if (!memories || memories.length < 2) continue

      const mergedIds = new Set<string>()

      for (let i = 0; i < memories.length; i++) {
        if (mergedIds.has(memories[i].id)) continue

        for (let j = i + 1; j < memories.length; j++) {
          if (mergedIds.has(memories[j].id)) continue

          const similarity = this.jaccardSimilarity(
            memories[i].content,
            memories[j].content,
          )

          if (similarity > MERGE_SIMILARITY_THRESHOLD) {
            // Keep the higher-confidence memory, supersede the other
            const keeper = memories[i]
            const loser = memories[j]

            await this.supabase
              .from('memory_palace_entries')
              .update({
                is_active: false,
                superseded_by: keeper.id,
              })
              .eq('id', loser.id)

            // Boost keeper's confidence from corroboration
            const newConf = Math.min(1.0,
              keeper.confidence + 0.05 * (loser.corroboration_count + 1),
            )
            await this.supabase
              .from('memory_palace_entries')
              .update({
                confidence: newConf,
                corroboration_count: keeper.corroboration_count + loser.corroboration_count + 1,
              })
              .eq('id', keeper.id)

            mergedIds.add(loser.id)
            merged++
          }
        }
      }
    }

    return merged
  }

  /**
   * Promote patterns that exceed the confidence threshold to full memories.
   */
  private async promotePatterns(orgId: string): Promise<number> {
    let promoted = 0

    const { data: patterns } = await this.supabase
      .from('memory_patterns')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .gte('confidence', PROMOTION_CONFIDENCE_THRESHOLD)
      .is('promoted_to_memory_id', null)
      .limit(20)

    if (!patterns || patterns.length === 0) return 0

    for (const pattern of patterns as MemoryPattern[]) {
      const memory = await this.writer.storeMemory({
        orgId,
        category: 'pattern',
        title: `${pattern.pattern_type.replace(/_/g, ' ')} pattern detected`,
        content: pattern.description,
        confidence: pattern.confidence,
        entityIds: pattern.entity_ids,
        entityNames: pattern.entity_names,
        source: 'pattern_detection',
        tags: ['auto-promoted', pattern.pattern_type],
        metadata: { pattern_id: pattern.id, pattern_data: pattern.pattern_data },
      })

      if (memory) {
        await this.supabase
          .from('memory_patterns')
          .update({
            status: 'promoted',
            promoted_to_memory_id: memory.id,
          })
          .eq('id', pattern.id)

        promoted++
      }
    }

    return promoted
  }

  /**
   * Archive memories whose confidence has dropped below threshold.
   */
  private async archiveLowConfidence(orgId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('memory_palace_entries')
      .update({ is_active: false })
      .eq('org_id', orgId)
      .eq('is_active', true)
      .lt('confidence', ARCHIVE_CONFIDENCE_THRESHOLD)
      .neq('decay_rate', 'never')
      .select('id')

    if (error) {
      logger.warn('[consolidation-pipeline] Archive failed', { error: error.message })
      return 0
    }

    return data?.length ?? 0
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))

    if (wordsA.size === 0 && wordsB.size === 0) return 1
    if (wordsA.size === 0 || wordsB.size === 0) return 0

    const intersection = [...wordsA].filter(w => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size

    return union > 0 ? intersection / union : 0
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConsolidationReport {
  orgId: string
  decayed: number
  merged: number
  promoted: number
  archived: number
  startedAt: string
  completedAt: string
}
