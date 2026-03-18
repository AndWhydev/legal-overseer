/**
 * Memory Palace — Proactive Recall
 *
 * Surfaces relevant memories during conversations without being asked.
 * Called during context assembly to inject memory palace insights
 * into the agent's context window.
 *
 * Strategy:
 * 1. Entity-scoped: memories linked to mentioned entities
 * 2. Topic-scoped: full-text search on conversation keywords
 * 3. Decision-scoped: recent decisions related to the topic
 * 4. Confidence-weighted: higher confidence = higher priority
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { createMemoryPalace } from './service'
import type { MemoryEntryRow, SearchMemoryResult } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecalledMemory {
  id: string
  type: string
  title: string
  content: string
  confidence: number
  entityNames: string[]
  occurredAt: string
  relevanceSource: 'entity' | 'topic' | 'decision'
}

export interface ProactiveRecallResult {
  memories: RecalledMemory[]
  formattedContext: string
  memoryCount: number
}

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_RECALLED_MEMORIES = 8
const MAX_CONTEXT_CHARS = 3000
const MIN_CONFIDENCE = 0.3

// ─── Proactive Recall ───────────────────────────────────────────────────────

/**
 * Surface relevant memories for a conversation context.
 * Called during context assembly before the main Anthropic API call.
 */
export async function recallForContext(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    entityIds?: string[]
    entityNames?: string[]
    query?: string
    maxMemories?: number
  },
): Promise<ProactiveRecallResult> {
  const maxMem = options.maxMemories ?? MAX_RECALLED_MEMORIES
  const palace = createMemoryPalace(supabase, orgId)
  const recalled: RecalledMemory[] = []
  const seenIds = new Set<string>()

  try {
    // 1. Entity-scoped recall: get memories for mentioned entities
    if (options.entityIds && options.entityIds.length > 0) {
      for (const entityId of options.entityIds.slice(0, 3)) {
        if (recalled.length >= maxMem) break

        const entityMemories = await palace.getEntityMemories(entityId, {
          limit: 5,
          minConfidence: MIN_CONFIDENCE,
        })

        for (const mem of entityMemories) {
          if (recalled.length >= maxMem) break
          if (seenIds.has(mem.id)) continue
          seenIds.add(mem.id)

          recalled.push({
            id: mem.id,
            type: mem.memory_type,
            title: mem.title,
            content: mem.content,
            confidence: mem.confidence,
            entityNames: mem.entity_names,
            occurredAt: mem.occurred_at,
            relevanceSource: 'entity',
          })
        }
      }
    }

    // 2. Topic-scoped recall: full-text search on conversation keywords
    if (options.query && recalled.length < maxMem) {
      // Extract meaningful keywords (skip stop words)
      const stopWords = new Set([
        'the', 'for', 'and', 'with', 'about', 'what', 'how', 'can', 'you',
        'please', 'tell', 'show', 'get', 'find', 'this', 'that', 'there',
        'have', 'has', 'was', 'were', 'are', 'is', 'been', 'being',
      ])
      const keywords = options.query
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
        .slice(0, 6)

      if (keywords.length > 0) {
        const searchQuery = keywords.join(' ')
        const searchResults = await palace.searchMemories({
          query: searchQuery,
          minConfidence: MIN_CONFIDENCE,
          limit: maxMem - recalled.length,
        })

        for (const result of searchResults) {
          if (recalled.length >= maxMem) break
          if (seenIds.has(result.id)) continue
          seenIds.add(result.id)

          recalled.push({
            id: result.id,
            type: result.memoryType,
            title: result.title,
            content: result.content,
            confidence: result.confidence,
            entityNames: result.entityNames,
            occurredAt: result.occurredAt,
            relevanceSource: 'topic',
          })
        }
      }
    }

    // 3. Decision-scoped recall: recent relevant decisions
    if (recalled.length < maxMem && options.entityIds?.length) {
      const decisions = await palace.getDecisions({
        limit: 3,
        entityId: options.entityIds[0],
      })

      for (const dec of decisions) {
        if (recalled.length >= maxMem) break
        if (seenIds.has(dec.memory_entry_id)) continue
        seenIds.add(dec.memory_entry_id)

        recalled.push({
          id: dec.memory_entry_id,
          type: 'decision',
          title: dec.decision_summary,
          content: `Decision: ${dec.decision_summary}. Reasoning: ${dec.reasoning_chain}. Outcome: ${dec.outcome_status}`,
          confidence: dec.memory?.confidence ?? 0.8,
          entityNames: dec.memory?.entity_names ?? [],
          occurredAt: dec.decided_at,
          relevanceSource: 'decision',
        })
      }
    }

    // Sort by confidence (highest first)
    recalled.sort((a, b) => b.confidence - a.confidence)

    // Format for context injection
    const formattedContext = formatMemoriesForContext(recalled)

    return {
      memories: recalled,
      formattedContext,
      memoryCount: recalled.length,
    }
  } catch (err) {
    logger.error('[proactive-recall] Failed to recall memories', {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    })
    return { memories: [], formattedContext: '', memoryCount: 0 }
  }
}

/**
 * Format recalled memories into a text block for system prompt injection.
 */
function formatMemoriesForContext(memories: RecalledMemory[]): string {
  if (memories.length === 0) return ''

  const lines: string[] = ['--- Institutional Memory ---']

  let charCount = 0
  for (const mem of memories) {
    const entry = formatSingleMemory(mem)
    if (charCount + entry.length > MAX_CONTEXT_CHARS) break
    lines.push(entry)
    charCount += entry.length
  }

  lines.push('--- End Memory ---')
  return lines.join('\n')
}

function formatSingleMemory(mem: RecalledMemory): string {
  const date = new Date(mem.occurredAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const conf = Math.round(mem.confidence * 100)
  const entities = mem.entityNames.length > 0 ? ` [${mem.entityNames.join(', ')}]` : ''
  const typeLabel = mem.type.replace('_', ' ')

  return `[${typeLabel}|${date}|${conf}%]${entities} ${mem.title}: ${mem.content.slice(0, 200)}`
}
