/**
 * Memory Palace Search — Hybrid full-text + semantic search across
 * memories, decisions, and patterns.
 *
 * Uses PostgreSQL tsvector for fast full-text search and optionally
 * combines with Pinecone semantic similarity for natural language queries.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { embedDocuments } from '@/lib/rag/voyage-client'
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

/**
 * Escape SQL LIKE/ILIKE wildcard characters from user input
 * to prevent pattern injection (%, _, \ are special in LIKE).
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

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
      // 1. Hybrid search: tsvector + vector in parallel, blended via RRF
      const [tsvectorResults, vectorResults] = await Promise.all([
        this.tsvectorSearch(options),
        this.vectorSearch(options),
      ])
      result.memories = this.reciprocalRankFusion(tsvectorResults, vectorResults, 60)
        .filter(m => m.confidence >= minConfidence)
        .slice(0, limit)

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
   * Full-text search via the search_memory_palace RPC (tsvector).
   * Falls back to ilike if the RPC is unavailable.
   */
  private async tsvectorSearch(
    options: MemorySearchOptions,
  ): Promise<(MemoryPalaceEntry & { rank: number })[]> {
    const { data, error } = await this.supabase.rpc('search_memory_palace', {
      p_org_id: options.orgId,
      p_query: options.query,
      p_category: options.category ?? null,
      p_entity_id: options.entityId ?? null,
      p_limit: options.limit ?? 20,
    })

    if (error) {
      logger.warn('[memory-search] RPC search failed, falling back to ilike', {
        error: error.message,
      })
      return this.fallbackSearch(
        options.orgId,
        options.query,
        options.category,
        options.entityId,
        options.limit ?? 20,
      )
    }

    return (data ?? []) as (MemoryPalaceEntry & { rank: number })[]
  }

  /**
   * Semantic vector search via Voyage embeddings + pgvector cosine similarity.
   */
  private async vectorSearch(
    options: MemorySearchOptions,
  ): Promise<(MemoryPalaceEntry & { rank: number })[]> {
    try {
      const vectors = await embedDocuments([options.query])
      if (!vectors || vectors.length === 0 || vectors[0].length !== 1024) return []

      const { data, error } = await this.supabase.rpc('search_memories_vector', {
        p_org_id: options.orgId,
        p_embedding: `[${vectors[0].join(',')}]`,
        p_category: options.category ?? null,
        p_entity_id: options.entityId ?? null,
        p_min_confidence: options.minConfidence ?? 0,
        p_limit: options.limit ?? 20,
      })

      if (error) return []

      return ((data ?? []) as (MemoryPalaceEntry & { similarity: number })[]).map(
        (m, i) => ({ ...m, rank: m.similarity ?? (1 - i * 0.05) }),
      )
    } catch {
      return []
    }
  }

  /**
   * Reciprocal Rank Fusion — merge two ranked result lists into one.
   * Higher k values dampen the effect of high-ranked items.
   */
  private reciprocalRankFusion(
    tsvectorResults: (MemoryPalaceEntry & { rank: number })[],
    vectorResults: (MemoryPalaceEntry & { rank: number })[],
    k: number = 60,
  ): (MemoryPalaceEntry & { rank: number })[] {
    const scoreMap = new Map<string, { entry: MemoryPalaceEntry; rrfScore: number }>()

    for (let i = 0; i < tsvectorResults.length; i++) {
      const entry = tsvectorResults[i]
      const existing = scoreMap.get(entry.id)
      scoreMap.set(entry.id, {
        entry,
        rrfScore: (existing?.rrfScore ?? 0) + 1 / (k + i + 1),
      })
    }

    for (let i = 0; i < vectorResults.length; i++) {
      const entry = vectorResults[i]
      const existing = scoreMap.get(entry.id)
      scoreMap.set(entry.id, {
        entry: existing?.entry ?? entry,
        rrfScore: (existing?.rrfScore ?? 0) + 1 / (k + i + 1),
      })
    }

    return [...scoreMap.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(({ entry, rrfScore }) => ({ ...entry, rank: rrfScore }))
  }

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
      .ilike('content', `%${escapeLikePattern(query)}%`)
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
      .or(`title.ilike.%${escapeLikePattern(query)}%,decision.ilike.%${escapeLikePattern(query)}%,reasoning.ilike.%${escapeLikePattern(query)}%`)
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
      .ilike('description', `%${escapeLikePattern(query)}%`)
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

// ─── Graph Search ─────────────────────────────────────────────────────────────

import {
  getEntityByAlias,
  getNeighborhood,
  getEntityEvents,
} from "@/lib/knowledge-graph/graph-queries"

/**
 * Search the knowledge graph for entity relationships and events.
 * Resolves entity aliases from query keywords, then fetches neighborhood
 * edges and event tuples, returning scored results.
 */
export async function graphSearch(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  options?: {
    entityIds?: string[]
    timeRange?: { from?: string; to?: string }
    limit?: number
  }
): Promise<Array<{ content: string; score: number; source: string; metadata: Record<string, unknown> }>> {
  try {
    const limit = options?.limit ?? 20
    const results: Array<{ content: string; score: number; source: string; metadata: Record<string, unknown> }> = []

    // Resolve entity IDs — use provided ones or extract from query keywords
    let entityIds = options?.entityIds ?? []
    if (entityIds.length === 0) {
      const keywords = query
        .split(/\s+/)
        .filter((w) => w.length > 2 && w[0] === w[0].toUpperCase())
        .slice(0, 5)

      for (const kw of keywords) {
        const node = await getEntityByAlias(supabase, orgId, kw)
        if (node) entityIds.push(node.id)
      }
    }

    if (entityIds.length === 0) return []

    // De-duplicate
    entityIds = [...new Set(entityIds)]

    for (const entityId of entityIds) {
      // 1. Neighborhood edges (direct relationships)
      const neighborhood = await getNeighborhood(supabase, orgId, entityId)
      if (neighborhood) {
        const nodeNameMap = new Map<string, string>()
        nodeNameMap.set(neighborhood.node.id, neighborhood.node.name)
        for (const n of neighborhood.neighbors) {
          nodeNameMap.set(n.id, n.name)
        }

        for (const edge of neighborhood.edges) {
          const sourceName = nodeNameMap.get(edge.source_id) ?? edge.source_id
          const targetName = nodeNameMap.get(edge.target_id) ?? edge.target_id
          const since = edge.valid_from ? ` (since ${edge.valid_from.slice(0, 10)})` : ""
          const content = `${sourceName} ${edge.relation_type} ${targetName}${since}`

          results.push({
            content,
            score: 0.9,
            source: "knowledge_graph_edge",
            metadata: {
              edge_id: edge.id,
              relation_type: edge.relation_type,
              source_entity: sourceName,
              target_entity: targetName,
              valid_from: edge.valid_from,
              valid_until: edge.valid_until,
              confidence: edge.confidence,
            },
          })
        }

        // 2-hop neighbors (lower score)
        for (const neighbor of neighborhood.neighbors) {
          const hop2 = await getNeighborhood(supabase, orgId, neighbor.id, { limit: 5 })
          if (hop2) {
            for (const e2 of hop2.edges) {
              // Skip edges we already have (back to root)
              if (e2.source_id === entityId || e2.target_id === entityId) continue
              const s2 = nodeNameMap.get(e2.source_id) ?? hop2.neighbors.find((n) => n.id === e2.source_id)?.name ?? e2.source_id
              const t2 = nodeNameMap.get(e2.target_id) ?? hop2.neighbors.find((n) => n.id === e2.target_id)?.name ?? e2.target_id
              results.push({
                content: `${s2} ${e2.relation_type} ${t2}`,
                score: 0.6,
                source: "knowledge_graph_2hop",
                metadata: {
                  edge_id: e2.id,
                  relation_type: e2.relation_type,
                  source_entity: s2,
                  target_entity: t2,
                },
              })
            }
          }
        }
      }

      // 2. Event tuples
      const timeRange = options?.timeRange
        ? { from: options.timeRange.from, to: options.timeRange.to }
        : undefined
      const events = await getEntityEvents(supabase, orgId, entityId, timeRange)

      for (const evt of events) {
        const objectPart = evt.object_text ? ` ${evt.object_text}` : ""
        const datePart = evt.occurred_at ? ` (${evt.occurred_at.slice(0, 10)})` : ""
        // We don not have the subject name directly on the tuple, use a placeholder
        const content = `[entity] ${evt.verb}${objectPart}${datePart}`

        results.push({
          content,
          score: 0.8,
          source: "knowledge_graph_event",
          metadata: {
            event_id: evt.id,
            verb: evt.verb,
            object_text: evt.object_text,
            occurred_at: evt.occurred_at,
            subject_id: evt.subject_id,
          },
        })
      }
    }

    // Sort by score descending, then limit
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  } catch (err) {
    logger.error("[graphSearch] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
      query,
    })
    return []
  }
}
