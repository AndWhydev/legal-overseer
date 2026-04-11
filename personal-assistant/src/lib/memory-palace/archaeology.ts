/**
 * Memory Palace Conversation Archaeology — Reconstruct narrative timelines
 * from archived threads, entity memories, and decisions.
 *
 * Answers questions like "Why did we stop working with TechCorp?"
 * by assembling a chronological narrative from multiple data sources.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  MemoryPalaceEntry,
  DecisionLogEntry,
  MemoryTimelineEvent,
} from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArchaeologyQuery {
  orgId: string
  query: string
  entityIds?: string[]
  dateFrom?: string
  dateTo?: string
  maxEvents?: number
}

export interface ArchaeologyResult {
  query: string
  timeline: ArchaeologyEvent[]
  narrative: string
  sourcesUsed: {
    memories: number
    decisions: number
    threadSummaries: number
    timelineEvents: number
  }
}

export interface ArchaeologyEvent {
  id: string
  type: 'memory' | 'decision' | 'thread_summary' | 'timeline_event'
  timestamp: string
  title: string
  content: string
  confidence: number
  entityNames: string[]
  source: string
}

// ─── Archaeology Engine ──────────────────────────────────────────────────────

export class ArchaeologyEngine {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Excavate: search multiple data sources and assemble a chronological narrative.
   */
  async excavate(query: ArchaeologyQuery): Promise<ArchaeologyResult> {
    const maxEvents = query.maxEvents ?? 30
    const events: ArchaeologyEvent[] = []
    const sourcesUsed = { memories: 0, decisions: 0, threadSummaries: 0, timelineEvents: 0 }

    try {
      // Run all searches in parallel
      const [memoryEvents, decisionEvents, threadEvents, timelineEvents] = await Promise.all([
        this.searchMemories(query),
        this.searchDecisions(query),
        this.searchThreadSummaries(query),
        this.searchEntityTimeline(query),
      ])

      events.push(...memoryEvents)
      events.push(...decisionEvents)
      events.push(...threadEvents)
      events.push(...timelineEvents)

      sourcesUsed.memories = memoryEvents.length
      sourcesUsed.decisions = decisionEvents.length
      sourcesUsed.threadSummaries = threadEvents.length
      sourcesUsed.timelineEvents = timelineEvents.length

      // Sort chronologically
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      // Trim to max
      const trimmed = events.slice(0, maxEvents)

      // Build narrative
      const narrative = this.buildNarrative(trimmed, query.query)

      logger.info('[archaeology] Excavation completed', {
        query: query.query,
        totalEvents: trimmed.length,
        ...sourcesUsed,
      })

      return {
        query: query.query,
        timeline: trimmed,
        narrative,
        sourcesUsed,
      }
    } catch (err) {
      logger.error('[archaeology] Excavation failed', {
        error: err instanceof Error ? err.message : String(err),
        query: query.query,
      })
      return {
        query: query.query,
        timeline: [],
        narrative: 'Unable to reconstruct timeline.',
        sourcesUsed,
      }
    }
  }

  // ─── Source Searches ──────────────────────────────────────────────────────

  private async searchMemories(query: ArchaeologyQuery): Promise<ArchaeologyEvent[]> {
    // Try RPC first, fall back to ilike
    const { data, error } = await this.supabase
      .rpc('search_memory_palace', {
        p_org_id: query.orgId,
        p_query: query.query,
        p_category: null,
        p_entity_id: query.entityIds?.[0] ?? null,
        p_limit: 15,
      })

    if (error || !data) {
      // Fallback
      const { data: fallback } = await this.supabase
        .from('memory_palace_entries')
        .select('*')
        .eq('org_id', query.orgId)
        .eq('is_active', true)
        .ilike('content', `%${query.query}%`)
        .order('confidence', { ascending: false })
        .limit(15)

      return (fallback ?? []).map((m: MemoryPalaceEntry) => ({
        id: m.id,
        type: 'memory' as const,
        timestamp: m.created_at,
        title: m.title ?? m.category,
        content: m.content,
        confidence: m.confidence,
        entityNames: m.entity_names ?? [],
        source: `memory:${m.category}`,
      }))
    }

    return (data as (MemoryPalaceEntry & { rank: number })[]).map(m => ({
      id: m.id,
      type: 'memory' as const,
      timestamp: m.created_at,
      title: m.title ?? m.category,
      content: m.content,
      confidence: m.confidence,
      entityNames: m.entity_names ?? [],
      source: `memory:${m.category}`,
    }))
  }

  private async searchDecisions(query: ArchaeologyQuery): Promise<ArchaeologyEvent[]> {
    let q = this.supabase
      .from('decision_log')
      .select('*')
      .eq('org_id', query.orgId)
      .or(`title.ilike.%${query.query}%,decision.ilike.%${query.query}%,reasoning.ilike.%${query.query}%`)
      .order('decided_at', { ascending: false })
      .limit(10)

    if (query.entityIds && query.entityIds.length > 0) {
      q = q.overlaps('entity_ids', query.entityIds)
    }

    const { data } = await q

    return (data ?? []).map((d: DecisionLogEntry) => ({
      id: d.id,
      type: 'decision' as const,
      timestamp: d.decided_at,
      title: d.title,
      content: `${d.decision} (Reasoning: ${d.reasoning})`,
      confidence: 1.0,
      entityNames: d.entity_names ?? [],
      source: `decision:${d.domain}`,
    }))
  }

  private async searchThreadSummaries(query: ArchaeologyQuery): Promise<ArchaeologyEvent[]> {
    const { data } = await this.supabase
      .from('thread_summaries')
      .select('id, thread_id, tier, summary_text, entity_ids, created_at, token_count')
      .eq('org_id', query.orgId)
      .ilike('summary_text', `%${query.query}%`)
      .order('created_at', { ascending: false })
      .limit(10)

    return (data ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      type: 'thread_summary' as const,
      timestamp: s.created_at as string,
      title: `Thread summary (${s.tier})`,
      content: s.summary_text as string,
      confidence: 0.8,
      entityNames: [],
      source: `thread:${s.thread_id}`,
    }))
  }

  private async searchEntityTimeline(query: ArchaeologyQuery): Promise<ArchaeologyEvent[]> {
    if (!query.entityIds || query.entityIds.length === 0) return []

    let q = this.supabase
      .from('entity_timeline')
      .select('id, entity_type, entity_id, event_type, event_data, channel_source, occurred_at')
      .eq('org_id', query.orgId)
      .in('entity_id', query.entityIds)
      .order('occurred_at', { ascending: false })
      .limit(15)

    if (query.dateFrom) q = q.gte('occurred_at', query.dateFrom)
    if (query.dateTo) q = q.lte('occurred_at', query.dateTo)

    const { data } = await q

    return (data ?? []).map((e: Record<string, unknown>) => {
      const eventData = (e.event_data ?? {}) as Record<string, unknown>
      return {
        id: e.id as string,
        type: 'timeline_event' as const,
        timestamp: e.occurred_at as string,
        title: (e.event_type as string).replace(/_/g, ' '),
        content: JSON.stringify(eventData).slice(0, 200),
        confidence: 0.9,
        entityNames: [],
        source: `timeline:${e.entity_type}:${e.entity_id}`,
      }
    })
  }

  // ─── Narrative Builder ────────────────────────────────────────────────────

  /**
   * Build a plain-text chronological narrative from archaeology events.
   * This is a deterministic summary (no LLM call) — LLM can refine if needed.
   */
  private buildNarrative(events: ArchaeologyEvent[], query: string): string {
    if (events.length === 0) {
      return `No records found related to "${query}".`
    }

    const lines: string[] = [`Timeline for "${query}" (${events.length} events):`]
    let currentMonth = ''

    for (const event of events) {
      const date = new Date(event.timestamp)
      const month = date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

      if (month !== currentMonth) {
        currentMonth = month
        lines.push(`\n--- ${month} ---`)
      }

      const day = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      const icon = event.type === 'decision' ? '>' :
        event.type === 'memory' ? '*' :
        event.type === 'thread_summary' ? '#' : '-'
      const entities = event.entityNames.length > 0
        ? ` [${event.entityNames.join(', ')}]`
        : ''

      lines.push(`  ${icon} ${day}: ${event.title}${entities}`)
      lines.push(`    ${event.content.slice(0, 150)}`)
    }

    return lines.join('\n')
  }
}
