/**
 * Memory Palace Service — Core CRUD + search for institutional knowledge.
 *
 * Provides typed memory storage, retrieval, confidence management,
 * decision tracking, and GDPR forget functionality.
 *
 * Uses Supabase for persistence with full-text search via tsvector.
 * Integrates with existing RAG/Pinecone for semantic search.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  MemoryType,
  DecayRate,
  SourceType,
  CreateMemoryInput,
  CreateDecisionInput,
  SearchMemoryInput,
  SearchMemoryResult,
  MemoryEntryRow,
  MemoryDecisionRow,
  MemoryStats,
  ForgetResult,
} from './types'

// ─── Default decay rates by memory type ─────────────────────────────────────

const DEFAULT_DECAY_RATES: Record<MemoryType, DecayRate> = {
  conversation: 'fast',
  decision: 'slow',
  pattern: 'slow',
  fact: 'normal',
  relationship: 'slow',
  pricing: 'normal',
  lesson_learned: 'never',
}

const DEFAULT_CONFIDENCE: Record<MemoryType, number> = {
  conversation: 0.6,
  decision: 0.8,
  pattern: 0.5,
  fact: 0.7,
  relationship: 0.7,
  pricing: 0.9,
  lesson_learned: 0.85,
}

// ─── Memory Palace Service ──────────────────────────────────────────────────

export class MemoryPalaceService {
  constructor(
    private supabase: SupabaseClient,
    private orgId: string,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────

  /**
   * Store a new memory entry. Returns the created memory ID.
   */
  async createMemory(input: CreateMemoryInput): Promise<string | null> {
    const {
      memoryType,
      title,
      content,
      typeMetadata = {},
      confidence = DEFAULT_CONFIDENCE[memoryType],
      decayRate = DEFAULT_DECAY_RATES[memoryType],
      sourceType = 'extraction',
      sourceThreadId,
      sourceMessageIds = [],
      sourceChannel,
      entityIds = [],
      entityNames = [],
      occurredAt = new Date().toISOString(),
    } = input

    try {
      const { data, error } = await this.supabase
        .from('memory_entries')
        .insert({
          org_id: this.orgId,
          memory_type: memoryType,
          title,
          content,
          type_metadata: typeMetadata,
          confidence,
          decay_rate: decayRate,
          source_type: sourceType,
          source_thread_id: sourceThreadId ?? null,
          source_message_ids: sourceMessageIds,
          source_channel: sourceChannel ?? null,
          entity_ids: entityIds,
          entity_names: entityNames,
          occurred_at: occurredAt,
        })
        .select('id')
        .single()

      if (error) {
        logger.error('[memory-palace] createMemory failed', { error: error.message, memoryType })
        return null
      }

      logger.info('[memory-palace] Memory created', {
        id: data.id,
        type: memoryType,
        title: title.slice(0, 60),
        entities: entityNames.length,
      })

      return data.id
    } catch (err) {
      logger.error('[memory-palace] createMemory exception', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Store a business decision with reasoning chain and alternatives.
   * Creates both a memory_entry (type=decision) and a memory_decisions record.
   */
  async createDecision(input: CreateDecisionInput): Promise<string | null> {
    const memoryId = await this.createMemory({
      memoryType: 'decision',
      title: input.decisionSummary,
      content: input.content,
      typeMetadata: {
        alternatives: input.alternatives ?? [],
        reasoning_chain: input.reasoningChain ?? '',
        domain: input.domain ?? 'general',
      },
      confidence: 0.9,
      decayRate: 'slow',
      sourceType: 'extraction',
      sourceThreadId: input.sourceThreadId,
      entityIds: input.entityIds,
      entityNames: input.entityNames,
      occurredAt: input.decidedAt,
    })

    if (!memoryId) return null

    try {
      const { error } = await this.supabase
        .from('memory_decisions')
        .insert({
          org_id: this.orgId,
          memory_entry_id: memoryId,
          decision_summary: input.decisionSummary,
          alternatives: input.alternatives ?? [],
          reasoning_chain: input.reasoningChain ?? '',
          participants: input.participants ?? [],
          domain: input.domain ?? null,
          decided_at: input.decidedAt ?? new Date().toISOString(),
        })

      if (error) {
        logger.error('[memory-palace] createDecision failed', { error: error.message })
      }

      return memoryId
    } catch (err) {
      logger.error('[memory-palace] createDecision exception', {
        error: err instanceof Error ? err.message : String(err),
      })
      return memoryId // memory was created even if decision record failed
    }
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  /**
   * Get a single memory by ID.
   */
  async getMemory(memoryId: string): Promise<MemoryEntryRow | null> {
    const { data, error } = await this.supabase
      .from('memory_entries')
      .select('*')
      .eq('id', memoryId)
      .eq('org_id', this.orgId)
      .maybeSingle()

    if (error) {
      logger.error('[memory-palace] getMemory failed', { error: error.message })
      return null
    }

    return data as MemoryEntryRow | null
  }

  /**
   * Get all memories for a specific entity.
   */
  async getEntityMemories(
    entityId: string,
    options?: { memoryType?: MemoryType; limit?: number; minConfidence?: number },
  ): Promise<MemoryEntryRow[]> {
    let query = this.supabase
      .from('memory_entries')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_active', true)
      .contains('entity_ids', [entityId])
      .gte('confidence', options?.minConfidence ?? 0.1)
      .order('confidence', { ascending: false })
      .order('occurred_at', { ascending: false })
      .limit(options?.limit ?? 20)

    if (options?.memoryType) {
      query = query.eq('memory_type', options.memoryType)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[memory-palace] getEntityMemories failed', { error: error.message })
      return []
    }

    return (data ?? []) as MemoryEntryRow[]
  }

  /**
   * Get decisions, optionally filtered by domain.
   */
  async getDecisions(options?: {
    domain?: string
    limit?: number
    entityId?: string
  }): Promise<(MemoryDecisionRow & { memory: MemoryEntryRow })[]> {
    let query = this.supabase
      .from('memory_decisions')
      .select('*, memory:memory_entries!memory_entry_id(*)')
      .eq('org_id', this.orgId)
      .order('decided_at', { ascending: false })
      .limit(options?.limit ?? 20)

    if (options?.domain) {
      query = query.eq('domain', options.domain)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[memory-palace] getDecisions failed', { error: error.message })
      return []
    }

    // Filter by entity if provided (post-query since it's on joined table)
    let results = (data ?? []) as (MemoryDecisionRow & { memory: MemoryEntryRow })[]
    if (options?.entityId) {
      results = results.filter(d =>
        d.memory?.entity_ids?.includes(options.entityId!),
      )
    }

    return results
  }

  // ─── Search ─────────────────────────────────────────────────────────────

  /**
   * Full-text search via Supabase tsvector. Fast, keyword-based.
   */
  async searchMemories(input: SearchMemoryInput): Promise<SearchMemoryResult[]> {
    try {
      const { data, error } = await this.supabase.rpc('search_memories', {
        p_org_id: this.orgId,
        p_query: input.query,
        p_memory_type: input.memoryType ?? null,
        p_entity_id: input.entityId ?? null,
        p_min_confidence: input.minConfidence ?? 0.1,
        p_limit: input.limit ?? 20,
      })

      if (error) {
        logger.error('[memory-palace] searchMemories RPC failed', { error: error.message })
        return this.fallbackSearch(input)
      }

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        memoryType: row.memory_type as MemoryType,
        title: row.title as string,
        content: row.content as string,
        confidence: row.confidence as number,
        entityIds: (row.entity_ids ?? []) as string[],
        entityNames: (row.entity_names ?? []) as string[],
        occurredAt: row.occurred_at as string,
        sourceType: row.source_type as SourceType,
        typeMetadata: (row.type_metadata ?? {}) as Record<string, unknown>,
        rank: row.rank as number,
      }))
    } catch (err) {
      logger.error('[memory-palace] searchMemories exception', {
        error: err instanceof Error ? err.message : String(err),
      })
      return this.fallbackSearch(input)
    }
  }

  /**
   * Fallback search using ILIKE when RPC is unavailable.
   */
  private async fallbackSearch(input: SearchMemoryInput): Promise<SearchMemoryResult[]> {
    let query = this.supabase
      .from('memory_entries')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_active', true)
      .gte('confidence', input.minConfidence ?? 0.1)
      .or(`title.ilike.%${input.query}%,content.ilike.%${input.query}%`)
      .order('confidence', { ascending: false })
      .limit(input.limit ?? 20)

    if (input.memoryType) {
      query = query.eq('memory_type', input.memoryType)
    }
    if (input.entityId) {
      query = query.contains('entity_ids', [input.entityId])
    }

    const { data } = await query

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      memoryType: row.memory_type as MemoryType,
      title: row.title as string,
      content: row.content as string,
      confidence: row.confidence as number,
      entityIds: (row.entity_ids ?? []) as string[],
      entityNames: (row.entity_names ?? []) as string[],
      occurredAt: row.occurred_at as string,
      sourceType: row.source_type as SourceType,
      typeMetadata: (row.type_metadata ?? {}) as Record<string, unknown>,
      rank: 0,
    }))
  }

  // ─── Confidence Management ──────────────────────────────────────────────

  /**
   * Corroborate a memory: increase confidence based on new evidence.
   */
  async corroborateMemory(memoryId: string, boost: number = 0.1): Promise<void> {
    // Get current memory to compute new confidence
    const { data: current } = await this.supabase
      .from('memory_entries')
      .select('confidence, corroboration_count')
      .eq('id', memoryId)
      .eq('org_id', this.orgId)
      .maybeSingle()

    if (!current) return

    const cappedBoost = Math.min(boost, 0.3)
    const newConfidence = Math.min(1.0, (current.confidence as number) + cappedBoost)
    const newCount = ((current.corroboration_count as number) ?? 0) + 1

    await this.supabase
      .from('memory_entries')
      .update({
        confidence: newConfidence,
        corroboration_count: newCount,
        last_corroborated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)
      .eq('org_id', this.orgId)
  }

  /**
   * Supersede a memory with a newer one.
   */
  async supersedeMemory(oldMemoryId: string, newMemoryId: string): Promise<void> {
    await this.supabase
      .from('memory_entries')
      .update({
        is_active: false,
        superseded_by: newMemoryId,
        archived_at: new Date().toISOString(),
        archive_reason: 'superseded',
      })
      .eq('id', oldMemoryId)
      .eq('org_id', this.orgId)
  }

  // ─── GDPR Forget ───────────────────────────────────────────────────────

  /**
   * GDPR forget: cascade-delete all memories linked to an entity.
   */
  async forgetEntity(entityId: string): Promise<ForgetResult> {
    try {
      const { data, error } = await this.supabase.rpc('forget_entity', {
        p_org_id: this.orgId,
        p_entity_id: entityId,
      })

      if (error) {
        logger.error('[memory-palace] forgetEntity RPC failed', { error: error.message })
        return { deletedMemories: 0, updatedMemories: 0, deletedDecisions: 0 }
      }

      const result = data as Record<string, number>
      logger.info('[memory-palace] Entity forgotten', { entityId, result })

      return {
        deletedMemories: result.deleted_memories ?? 0,
        updatedMemories: result.updated_memories ?? 0,
        deletedDecisions: result.deleted_decisions ?? 0,
      }
    } catch (err) {
      logger.error('[memory-palace] forgetEntity exception', {
        error: err instanceof Error ? err.message : String(err),
      })
      return { deletedMemories: 0, updatedMemories: 0, deletedDecisions: 0 }
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────────

  /**
   * Get memory health metrics.
   */
  async getStats(): Promise<MemoryStats> {
    const [activeRes, archivedRes, typeRes, confRes, decisionRes, rangeRes] = await Promise.all([
      this.supabase
        .from('memory_entries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', this.orgId)
        .eq('is_active', true),
      this.supabase
        .from('memory_entries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', this.orgId)
        .eq('is_active', false),
      this.supabase
        .from('memory_entries')
        .select('memory_type')
        .eq('org_id', this.orgId)
        .eq('is_active', true),
      this.supabase
        .from('memory_entries')
        .select('confidence')
        .eq('org_id', this.orgId)
        .eq('is_active', true),
      this.supabase
        .from('memory_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', this.orgId)
        .gte('decided_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      this.supabase
        .from('memory_entries')
        .select('occurred_at')
        .eq('org_id', this.orgId)
        .eq('is_active', true)
        .order('occurred_at', { ascending: true })
        .limit(1),
    ])

    // Count by type
    const byType: Record<string, number> = {}
    for (const row of typeRes.data ?? []) {
      const t = (row as Record<string, string>).memory_type
      byType[t] = (byType[t] ?? 0) + 1
    }

    // Confidence distribution
    let high = 0, medium = 0, low = 0, sum = 0
    for (const row of confRes.data ?? []) {
      const c = (row as Record<string, number>).confidence
      sum += c
      if (c > 0.7) high++
      else if (c >= 0.3) medium++
      else low++
    }
    const totalConf = confRes.data?.length ?? 0

    // Date range
    const oldest = rangeRes.data?.[0]?.occurred_at ?? null

    return {
      totalActive: activeRes.count ?? 0,
      totalArchived: archivedRes.count ?? 0,
      byType: byType as Record<MemoryType, number>,
      avgConfidence: totalConf > 0 ? sum / totalConf : 0,
      confidenceDistribution: { high, medium, low },
      recentDecisions: decisionRes.count ?? 0,
      oldestMemory: oldest,
      newestMemory: null, // could add another query but not critical
    }
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  /**
   * Update a decision's outcome.
   */
  async recordDecisionOutcome(
    decisionId: string,
    outcome: {
      status: 'successful' | 'failed' | 'revised' | 'unknown'
      notes?: string
      lessonLearned?: string
    },
  ): Promise<void> {
    const { error } = await this.supabase
      .from('memory_decisions')
      .update({
        outcome_status: outcome.status,
        outcome_notes: outcome.notes ?? null,
        lesson_learned: outcome.lessonLearned ?? null,
        outcome_recorded_at: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .eq('org_id', this.orgId)

    if (error) {
      logger.error('[memory-palace] recordDecisionOutcome failed', { error: error.message })
      return
    }

    // If there's a lesson learned, create a separate lesson_learned memory
    if (outcome.lessonLearned) {
      const { data: decision } = await this.supabase
        .from('memory_decisions')
        .select('memory_entry_id, decision_summary, domain')
        .eq('id', decisionId)
        .single()

      if (decision) {
        const { data: memory } = await this.supabase
          .from('memory_entries')
          .select('entity_ids, entity_names')
          .eq('id', decision.memory_entry_id)
          .single()

        await this.createMemory({
          memoryType: 'lesson_learned',
          title: `Lesson from: ${decision.decision_summary}`,
          content: outcome.lessonLearned,
          typeMetadata: {
            context: decision.decision_summary,
            what_happened: outcome.notes ?? '',
            what_we_learned: outcome.lessonLearned,
            applies_to: [decision.domain ?? 'general'],
          },
          confidence: 0.85,
          decayRate: 'never',
          sourceType: 'agent_reflection',
          entityIds: memory?.entity_ids ?? [],
          entityNames: memory?.entity_names ?? [],
        })
      }
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

/**
 * Create a MemoryPalaceService for an org.
 */
export function createMemoryPalace(
  supabase: SupabaseClient,
  orgId: string,
): MemoryPalaceService {
  return new MemoryPalaceService(supabase, orgId)
}
