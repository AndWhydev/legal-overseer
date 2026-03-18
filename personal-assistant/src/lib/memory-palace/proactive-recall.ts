/**
<<<<<<< HEAD
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
=======
 * Memory Palace Proactive Recall — Automatically surface relevant memories
 * during conversations without being asked.
 *
 * Integrates with the context assembly pipeline to inject entity memories,
 * recent decisions, active patterns, and warnings into the system prompt.
 *
 * Budget: ~500 tokens of proactive recall per conversation turn.
>>>>>>> v1.5-marketing-launch
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
<<<<<<< HEAD
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
=======
import type {
  MemoryPalaceEntry,
  DecisionLogEntry,
  MemoryPattern,
} from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECALL_TOKENS = 500
const MAX_MEMORIES_PER_ENTITY = 5
const MAX_DECISIONS_PER_ENTITY = 3
const MAX_PATTERNS_PER_ENTITY = 2
const MIN_RECALL_CONFIDENCE = 0.3

// ─── Proactive Recall ────────────────────────────────────────────────────────

export interface ProactiveRecallResult {
  entityId: string
  entityName: string | null
  memories: MemoryPalaceEntry[]
  decisions: DecisionLogEntry[]
  patterns: MemoryPattern[]
  formattedText: string
  tokenEstimate: number
}

/**
 * Recall relevant memories for entities mentioned in a message.
 * Returns formatted text ready for injection into the system prompt.
 */
export async function proactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<ProactiveRecallResult[]> {
  if (entityIds.length === 0) return []

  const results: ProactiveRecallResult[] = []
  let totalTokens = 0

  for (const entityId of entityIds.slice(0, 3)) {
    if (totalTokens >= MAX_RECALL_TOKENS) break

    try {
      const recall = await recallForEntity(supabase, orgId, entityId)
      if (recall.tokenEstimate > 0) {
        results.push(recall)
        totalTokens += recall.tokenEstimate
      }
    } catch (err) {
      logger.warn('[proactive-recall] Failed for entity', {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/**
 * Format proactive recall results as a system prompt section.
 */
export function formatProactiveRecall(results: ProactiveRecallResult[]): string {
  if (results.length === 0) return ''

  const sections: string[] = ['<memory-palace>']

  for (const r of results) {
    if (r.formattedText.length === 0) continue
    sections.push(r.formattedText)
  }

  sections.push('</memory-palace>')
  return sections.join('\n')
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function recallForEntity(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
): Promise<ProactiveRecallResult> {
  const result: ProactiveRecallResult = {
    entityId,
    entityName: null,
    memories: [],
    decisions: [],
    patterns: [],
    formattedText: '',
    tokenEstimate: 0,
  }

  // 1. Load top memories by confidence
  const { data: memories } = await supabase
    .from('memory_palace_entries')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('entity_ids', [entityId])
    .gte('confidence', MIN_RECALL_CONFIDENCE)
    .order('confidence', { ascending: false })
    .limit(MAX_MEMORIES_PER_ENTITY)

  result.memories = (memories ?? []) as MemoryPalaceEntry[]

  // Extract entity name
  for (const mem of result.memories) {
    const idx = mem.entity_ids.indexOf(entityId)
    if (idx >= 0 && mem.entity_names?.[idx]) {
      result.entityName = mem.entity_names[idx]
      break
    }
  }

  // 2. Load recent decisions
  const { data: decisions } = await supabase
    .from('decision_log')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .contains('entity_ids', [entityId])
    .order('decided_at', { ascending: false })
    .limit(MAX_DECISIONS_PER_ENTITY)

  result.decisions = (decisions ?? []) as DecisionLogEntry[]

  // 3. Load active patterns
  const { data: patterns } = await supabase
    .from('memory_patterns')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .contains('entity_ids', [entityId])
    .order('confidence', { ascending: false })
    .limit(MAX_PATTERNS_PER_ENTITY)

  result.patterns = (patterns ?? []) as MemoryPattern[]

  // 4. Format for context injection
  result.formattedText = formatEntityRecall(result)
  result.tokenEstimate = Math.ceil(result.formattedText.length / 4)

  return result
}

function formatEntityRecall(recall: ProactiveRecallResult): string {
  const lines: string[] = []
  const name = recall.entityName ?? recall.entityId.slice(0, 8)

  if (recall.memories.length === 0 && recall.decisions.length === 0 && recall.patterns.length === 0) {
    return ''
  }

  lines.push(`[${name}]`)

  // Memories (most important first)
  for (const mem of recall.memories) {
    const conf = Math.round(mem.confidence * 100)
    const tag = mem.category === 'pricing' ? '$' :
      mem.category === 'convention' ? '!' :
      mem.category === 'relationship' ? '~' :
      mem.category === 'decision' ? '>' :
      '-'
    lines.push(`  ${tag} ${mem.content.slice(0, 120)} (${conf}%)`)
  }

  // Decisions
  for (const dec of recall.decisions) {
    const date = new Date(dec.decided_at).toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric',
    })
    lines.push(`  > Decision (${date}): ${dec.title} — ${dec.decision.slice(0, 80)}`)
  }

  // Patterns
  for (const pat of recall.patterns) {
    const conf = Math.round(pat.confidence * 100)
    lines.push(`  ~ Pattern: ${pat.description.slice(0, 100)} (${conf}%, n=${pat.sample_count})`)
  }

  return lines.join('\n')
}
>>>>>>> v1.5-marketing-launch
