/**
 * Memory Palace Search — Hybrid full-text + semantic search across
 * memories, decisions, and patterns.
 *
 * Uses PostgreSQL tsvector for fast full-text search and optionally
 * combines with Pinecone semantic similarity for natural language queries.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  MemorySearchOptions,
  MemorySearchResult,
  MemoryPalaceEntry,
  DecisionLogEntry,
  MemoryPattern,
  EntityRecallOptions,
  EntityRecallResult,
  MemoryTimelineEvent,
} from './types'

// ─── Memory Search Engine ────────────────────────────────────────────────────

export class MemorySearch {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Hybrid search across all memory types.
   * Uses the search_memory_palace() Postgres function for tsvector search
   * and optionally combines with semantic results.
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    const {
      query,
      orgId,
      category,
      entityId,
      limit = 20,
      includeDecisions = true,
      includePatterns = true,
      minConfidence = 0,
    } = options

    const result: MemorySearchResult = {
      memories: [],
      decisions: [],
      patterns: [],
      totalCount: 0,
    }

    try {
      // 1. Full-text search on memory_palace_entries via RPC
      const { data: memoryResults, error: memoryError } = await this.supabase
        .rpc('search_memory_palace', {
          p_org_id: orgId,
          p_query: query,
          p_category: category ?? null,
          p_entity_id: entityId ?? null,
          p_limit: limit,
        })

      if (memoryError) {
        logger.warn('[memory-search] RPC search failed, falling back to ilike', {
          error: memoryError.message,
        })
        // Fallback: simple ilike search
        const fallback = await this.fallbackSearch(orgId, query, category, entityId, limit)
        result.memories = fallback
      } else if (memoryResults) {
        result.memories = (memoryResults as (MemoryPalaceEntry & { rank: number })[])
          .filter(m => m.confidence >= minConfidence)
      }

      // 2. Search decisions
      if (includeDecisions) {
        result.decisions = await this.searchDecisions(orgId, query, entityId, Math.ceil(limit / 3))
      }

      // 3. Search patterns
      if (includePatterns) {
        result.patterns = await this.searchPatterns(orgId, query, entityId, Math.ceil(limit / 3))
      }

      result.totalCount =
        result.memories.length +
        result.decisions.length +
        result.patterns.length

      logger.debug('[memory-search] Search completed', {
        query,
        memories: result.memories.length,
        decisions: result.decisions.length,
        patterns: result.patterns.length,
      })
    } catch (err) {
      logger.error('[memory-search] Search failed', {
        error: err instanceof Error ? err.message : String(err),
        query,
      })
    }

    return result
  }

  /**
   * Recall everything known about a specific entity.
   */
  async recallEntity(options: EntityRecallOptions): Promise<EntityRecallResult> {
    const {
      orgId,
      entityId,
      categories,
      limit = 50,
      includeDecisions = true,
      includePatterns = true,
    } = options

    const result: EntityRecallResult = {
      entityId,
      entityName: null,
      memories: [],
      decisions: [],
      patterns: [],
      timeline: [],
    }

    try {
      // 1. Load memories linked to this entity
      let memQuery = this.supabase
        .from('memory_palace_entries')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .contains('entity_ids', [entityId])
        .order('confidence', { ascending: false })
        .limit(limit)

      if (categories && categories.length > 0) {
        memQuery = memQuery.in('category', categories)
      }

      const { data: memories } = await memQuery
      result.memories = (memories ?? []) as MemoryPalaceEntry[]

      // Extract entity name from the first memory that has it
      for (const mem of result.memories) {
        const idx = mem.entity_ids.indexOf(entityId)
        if (idx >= 0 && mem.entity_names[idx]) {
          result.entityName = mem.entity_names[idx]
          break
        }
      }

      // 2. Load decisions
      if (includeDecisions) {
        const { data: decisions } = await this.supabase
          .from('decision_log')
          .select('*')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .contains('entity_ids', [entityId])
          .order('decided_at', { ascending: false })
          .limit(20)

        result.decisions = (decisions ?? []) as DecisionLogEntry[]
      }

      // 3. Load patterns
      if (includePatterns) {
        const { data: patterns } = await this.supabase
          .from('memory_patterns')
          .select('*')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .contains('entity_ids', [entityId])
          .order('confidence', { ascending: false })
          .limit(10)

        result.patterns = (patterns ?? []) as MemoryPattern[]
      }

      // 4. Build unified timeline
      result.timeline = this.buildTimeline(result)

      logger.debug('[memory-search] Entity recall completed', {
        entityId,
        memories: result.memories.length,
        decisions: result.decisions.length,
        patterns: result.patterns.length,
      })
    } catch (err) {
      logger.error('[memory-search] Entity recall failed', {
        error: err instanceof Error ? err.message : String(err),
        entityId,
      })
    }

    return result
  }

  /**
   * Get recent memories for an org — for the Memory Explorer feed.
   */
  async getRecentMemories(
    orgId: string,
    limit = 30,
    offset = 0,
    category?: string,
  ): Promise<MemoryPalaceEntry[]> {
    let query = this.supabase
      .from('memory_palace_entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[memory-search] getRecentMemories failed', { error: error.message })
      return []
    }

    return (data ?? []) as MemoryPalaceEntry[]
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Fallback ilike search when tsvector RPC is unavailable.
   */
  private async fallbackSearch(
    orgId: string,
    query: string,
    category: string | undefined,
    entityId: string | undefined,
    limit: number,
  ): Promise<(MemoryPalaceEntry & { rank: number })[]> {
    let q = this.supabase
      .from('memory_palace_entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .ilike('content', `%${query}%`)
      .order('confidence', { ascending: false })
      .limit(limit)

    if (category) q = q.eq('category', category)
    if (entityId) q = q.contains('entity_ids', [entityId])

    const { data } = await q
    return ((data ?? []) as MemoryPalaceEntry[]).map((m, i) => ({
      ...m,
      rank: 1 - i * 0.05,
    }))
  }

  /**
   * Search decisions by full-text.
   */
  private async searchDecisions(
    orgId: string,
    query: string,
    entityId: string | undefined,
    limit: number,
  ): Promise<DecisionLogEntry[]> {
    // Use ilike as a simpler approach for now
    let q = this.supabase
      .from('decision_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .or(`title.ilike.%${query}%,decision.ilike.%${query}%,reasoning.ilike.%${query}%`)
      .order('decided_at', { ascending: false })
      .limit(limit)

    if (entityId) {
      q = q.contains('entity_ids', [entityId])
    }

    const { data } = await q
    return (data ?? []) as DecisionLogEntry[]
  }

  /**
   * Search patterns by description.
   */
  private async searchPatterns(
    orgId: string,
    query: string,
    entityId: string | undefined,
    limit: number,
  ): Promise<MemoryPattern[]> {
    let q = this.supabase
      .from('memory_patterns')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .ilike('description', `%${query}%`)
      .order('confidence', { ascending: false })
      .limit(limit)

    if (entityId) {
      q = q.contains('entity_ids', [entityId])
    }

    const { data } = await q
    return (data ?? []) as MemoryPattern[]
  }

  /**
   * Build a unified timeline from memories, decisions, and patterns.
   */
  private buildTimeline(recall: EntityRecallResult): MemoryTimelineEvent[] {
    const events: MemoryTimelineEvent[] = []

    for (const mem of recall.memories) {
      events.push({
        id: mem.id,
        type: 'memory',
        title: mem.title ?? mem.category,
        content: mem.content,
        confidence: mem.confidence,
        category: mem.category,
        timestamp: mem.created_at,
        entityNames: mem.entity_names,
      })
    }

    for (const dec of recall.decisions) {
      events.push({
        id: dec.id,
        type: 'decision',
        title: dec.title,
        content: dec.decision,
        confidence: 1.0,
        category: dec.domain,
        timestamp: dec.decided_at,
        entityNames: dec.entity_names,
      })
    }

    for (const pat of recall.patterns) {
      events.push({
        id: pat.id,
        type: 'pattern',
        title: pat.pattern_type.replace(/_/g, ' '),
        content: pat.description,
        confidence: pat.confidence,
        category: pat.pattern_type,
        timestamp: pat.last_observed_at,
        entityNames: pat.entity_names,
      })
    }

    // Sort chronologically, most recent first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return events
  }
}
