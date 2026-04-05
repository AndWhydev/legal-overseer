/**
 * Memory Palace Writer — Store memories with validation, deduplication,
 * and optional vector embedding.
 *
 * Entry point for all memory creation: user-explicit, auto-extracted,
 * pattern-promoted, and consolidation-derived memories.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { embedDocuments } from '@/lib/rag/voyage-client'
import type {
  MemoryPalaceEntry,
  StoreMemoryInput,
  StoreDecisionInput,
  DecisionLogEntry,
  DecayRate,
  MemoryCategory,
} from './types'

// ─── Decay Rate Defaults by Category ─────────────────────────────────────────

const CATEGORY_DECAY_RATES: Record<MemoryCategory, DecayRate> = {
  conversation: 'fast',
  decision: 'slow',
  pattern: 'slow',
  fact: 'normal',
  relationship: 'slow',
  pricing: 'normal',
  convention: 'never',
}

// ─── Memory Writer ───────────────────────────────────────────────────────────

export class MemoryWriter {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Store a new memory entry. Validates, deduplicates, and returns the created entry.
   */
  async storeMemory(input: StoreMemoryInput): Promise<MemoryPalaceEntry | null> {
    try {
      // Determine decay rate from category unless source is user_explicit
      const decayRate = input.source === 'user_explicit'
        ? 'never' as DecayRate
        : CATEGORY_DECAY_RATES[input.category]

      const confidence = input.confidence ?? 0.7

      // Check for near-duplicate before inserting
      const isDuplicate = await this.checkDuplicate(input.orgId, input.content, input.entityIds)
      if (isDuplicate) {
        // Corroborate existing memory instead
        await this.corroborate(isDuplicate, confidence)
        logger.debug('[memory-writer] Corroborated existing memory', {
          existingId: isDuplicate,
          content: input.content.slice(0, 50),
        })
        return null
      }

      const row = {
        org_id: input.orgId,
        category: input.category,
        title: input.title ?? null,
        content: input.content,
        confidence,
        decay_rate: decayRate,
        corroboration_count: 0,
        entity_ids: input.entityIds ?? [],
        entity_names: input.entityNames ?? [],
        source: input.source ?? 'auto',
        source_thread_id: input.sourceThreadId ?? null,
        source_turn_number: input.sourceTurnNumber ?? null,
        source_channel: input.sourceChannel ?? null,
        is_active: true,
        tags: input.tags ?? [],
        metadata: input.metadata ?? {},
      }

      const { data, error } = await this.supabase
        .from('memory_palace_entries')
        .insert(row)
        .select()
        .single()

      if (error) {
        logger.error('[memory-writer] Failed to store memory', {
          error: error.message,
          category: input.category,
        })
        return null
      }

      logger.info('[memory-writer] Stored memory', {
        id: data.id,
        category: input.category,
        confidence,
        entityCount: (input.entityIds ?? []).length,
      })

      // Fire-and-forget embedding (non-blocking)
      this.embedMemory(data.id, input.content).catch(() => {})

      return data as MemoryPalaceEntry
    } catch (err) {
      logger.error('[memory-writer] storeMemory failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Store a decision with full reasoning chain.
   */
  async storeDecision(input: StoreDecisionInput): Promise<DecisionLogEntry | null> {
    try {
      // Also create a memory_palace_entry for cross-referencing
      const memoryEntry = await this.storeMemory({
        orgId: input.orgId,
        category: 'decision',
        title: input.title,
        content: `Decision: ${input.decision}. Reasoning: ${input.reasoning}`,
        confidence: 0.95,
        entityIds: input.entityIds,
        entityNames: input.entityNames,
        source: 'auto',
        sourceThreadId: input.sourceThreadId,
        tags: ['decision', input.domain ?? 'general'],
      })

      const row = {
        org_id: input.orgId,
        memory_id: memoryEntry?.id ?? null,
        title: input.title,
        decision: input.decision,
        alternatives: input.alternatives ?? [],
        reasoning: input.reasoning,
        entity_ids: input.entityIds ?? [],
        entity_names: input.entityNames ?? [],
        source_thread_id: input.sourceThreadId ?? null,
        decided_by: input.decidedBy ?? null,
        decided_at: new Date().toISOString(),
        domain: input.domain ?? 'general',
        impact: input.impact ?? 'low',
        status: 'active',
      }

      const { data, error } = await this.supabase
        .from('decision_log')
        .insert(row)
        .select()
        .single()

      if (error) {
        logger.error('[memory-writer] Failed to store decision', {
          error: error.message,
          title: input.title,
        })
        return null
      }

      logger.info('[memory-writer] Stored decision', {
        id: data.id,
        title: input.title,
        domain: input.domain,
        impact: input.impact,
      })

      return data as DecisionLogEntry
    } catch (err) {
      logger.error('[memory-writer] storeDecision failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Supersede an existing memory with a new one.
   */
  async supersede(
    orgId: string,
    oldMemoryId: string,
    newContent: string,
    newConfidence?: number,
  ): Promise<MemoryPalaceEntry | null> {
    // Load the old memory to inherit properties
    const { data: old } = await this.supabase
      .from('memory_palace_entries')
      .select('*')
      .eq('id', oldMemoryId)
      .eq('org_id', orgId)
      .single()

    if (!old) return null

    // Create new memory
    const newEntry = await this.storeMemory({
      orgId,
      category: old.category,
      title: old.title,
      content: newContent,
      confidence: newConfidence ?? old.confidence,
      entityIds: old.entity_ids,
      entityNames: old.entity_names,
      source: 'consolidation',
      tags: old.tags,
    })

    if (newEntry) {
      // Mark old as superseded
      await this.supabase
        .from('memory_palace_entries')
        .update({
          is_active: false,
          superseded_by: newEntry.id,
        })
        .eq('id', oldMemoryId)
        .eq('org_id', orgId)
    }

    return newEntry
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Generate and store a vector embedding for a memory entry.
   */
  private async embedMemory(memoryId: string, content: string): Promise<void> {
    const vectors = await embedDocuments([content])
    if (!vectors || vectors.length === 0 || vectors[0].length !== 1024) return
    await this.supabase
      .from('memory_palace_entries')
      .update({ content_embedding: `[${vectors[0].join(',')}]` })
      .eq('id', memoryId)
  }

  /**
   * Check if a near-duplicate memory already exists.
   * Uses keyword overlap as a fast heuristic.
   */
  private async checkDuplicate(
    orgId: string,
    content: string,
    entityIds?: string[],
  ): Promise<string | null> {
    // Extract significant words for matching
    const keywords = content
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 3)

    if (keywords.length === 0) return null

    let query = this.supabase
      .from('memory_palace_entries')
      .select('id, content')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .ilike('content', `%${keywords[0]}%`)
      .limit(5)

    if (entityIds && entityIds.length > 0) {
      query = query.overlaps('entity_ids', entityIds)
    }

    const { data } = await query

    if (!data || data.length === 0) return null

    // Check Jaccard similarity
    const candidateWords = new Set(content.toLowerCase().split(/\s+/))

    for (const existing of data) {
      const existingWords = new Set(existing.content.toLowerCase().split(/\s+/))
      const intersection = [...candidateWords].filter(w => existingWords.has(w)).length
      const union = new Set([...candidateWords, ...existingWords]).size
      const jaccard = union > 0 ? intersection / union : 0

      if (jaccard > 0.7) return existing.id
    }

    return null
  }

  /**
   * Corroborate an existing memory — increase confidence and count.
   */
  private async corroborate(memoryId: string, newConfidence: number): Promise<void> {
    const { data } = await this.supabase
      .from('memory_palace_entries')
      .select('confidence, corroboration_count')
      .eq('id', memoryId)
      .single()

    if (!data) return

    // Weighted average: existing confidence gets more weight with more corroborations
    const weight = data.corroboration_count + 1
    const newConf = Math.min(1.0,
      (data.confidence * weight + newConfidence) / (weight + 1)
    )

    await this.supabase
      .from('memory_palace_entries')
      .update({
        confidence: newConf,
        corroboration_count: data.corroboration_count + 1,
        last_decayed_at: new Date().toISOString(), // reset decay timer on corroboration
      })
      .eq('id', memoryId)
  }
}
