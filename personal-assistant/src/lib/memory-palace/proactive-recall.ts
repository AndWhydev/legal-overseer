/**
 * Memory Palace Proactive Recall — Automatically surface relevant memories
 * during conversations without being asked.
 *
 * Integrates with the context assembly pipeline to inject entity memories,
 * recent decisions, active patterns, and warnings into the system prompt.
 *
 * Budget: ~500 tokens of proactive recall per conversation turn.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
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
