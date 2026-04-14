/**
 * Memory Palace Proactive Recall — Graph-aware retrieval (Phase 36)
 *
 * Surfaces relevant memories during conversations using the knowledge graph:
 * 1. Graph neighborhood (edges + neighbors) for mentioned entities
 * 2. Recent event tuples (last 30 days)
 * 3. Optional vector-similarity matches
 * 4. Blended scoring: 0.4*relevance + 0.3*confidence + 0.2*recency + 0.1*edgeWeight
 *
 * Falls back to legacy memory_palace_entries when graph data is unavailable.
 *
 * Budget: ~1500 tokens of proactive recall per conversation turn.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import {
  getNeighborhood,
  getEntityEvents,
  vectorSearchEntities,
} from '@/lib/knowledge-graph/graph-queries'
import type {
  EntityEdge,
  EventTuple,
} from '@/lib/knowledge-graph/types'
import { activate, strengthen } from '@/lib/neural-graph/engine'
import type { ActivationResult } from '@/lib/neural-graph/types'
import type {
  MemoryPalaceEntry,
  DecisionLogEntry,
  MemoryPattern,
} from './types'
import { getRetrievalConfig } from '@/lib/rag/query-router'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECALL_TOKENS = getRetrievalConfig('moderate').tokenBudget
const RECENCY_DECAY = 0.01
const SCORE_WEIGHTS = {
  relevance: 0.4,
  confidence: 0.3,
  recency: 0.2,
  edgeWeight: 0.1,
}

// Legacy constants (kept for legacyProactiveRecall)
const LEGACY_MAX_TOKENS = 500
const MAX_MEMORIES_PER_ENTITY = 5
const MAX_DECISIONS_PER_ENTITY = 3
const MAX_PATTERNS_PER_ENTITY = 2
const MIN_RECALL_CONFIDENCE = 0.3

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoredItem {
  type: 'edge' | 'event' | 'vector'
  description: string
  blendedScore: number
  relevance: number
  confidence: number
  recency: number
  edgeWeight: number
}

export interface GraphAwareRecallResult {
  entityId: string
  entityName: string
  formattedText: string
  tokenEstimate: number
  scoredItems: ScoredItem[]
}

/** Legacy result type — kept for backwards compatibility */
export interface ProactiveRecallResult {
  entityId: string
  entityName: string | null
  memories: MemoryPalaceEntry[]
  decisions: DecisionLogEntry[]
  patterns: MemoryPattern[]
  formattedText: string
  tokenEstimate: number
  scoredItems?: ScoredItem[]
}

// ─── Graph-Aware Recall (New) ────────────────────────────────────────────────

function ageDays(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

function computeBlendedScore(item: { relevance: number; confidence: number; recency: number; edgeWeight: number }): number {
  return (
    SCORE_WEIGHTS.relevance * item.relevance +
    SCORE_WEIGHTS.confidence * item.confidence +
    SCORE_WEIGHTS.recency * item.recency +
    SCORE_WEIGHTS.edgeWeight * item.edgeWeight
  )
}

function scoreEdge(edge: EntityEdge, neighborName: string, rootEntityId: string): ScoredItem {
  const recency = Math.exp(-RECENCY_DECAY * ageDays(edge.valid_from))
  const direction = edge.source_id === rootEntityId ? '-->' : '<--'
  const scores = {
    relevance: 1.0,
    confidence: edge.confidence,
    recency,
    edgeWeight: 1.0,
  }
  return {
    type: 'edge',
    description: `${edge.relation_type} ${direction} ${neighborName}`,
    ...scores,
    blendedScore: computeBlendedScore(scores),
  }
}

function scoreEvent(event: EventTuple): ScoredItem {
  const recency = Math.exp(-RECENCY_DECAY * ageDays(event.occurred_at))
  const scores = {
    relevance: 0.8,
    confidence: 0.7,
    recency,
    edgeWeight: 0.5,
  }
  const objectText = event.object_text ? `: ${event.object_text}` : ''
  return {
    type: 'event',
    description: `${event.verb}${objectText}`,
    ...scores,
    blendedScore: computeBlendedScore(scores),
  }
}

function scoreVectorMatch(match: { name: string; similarity: number }): ScoredItem {
  const scores = {
    relevance: match.similarity,
    confidence: 0.6,
    recency: 0.5,
    edgeWeight: 0.3,
  }
  return {
    type: 'vector',
    description: `Related: ${match.name}`,
    ...scores,
    blendedScore: computeBlendedScore(scores),
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

function formatGraphResult(entityName: string, scoredItems: ScoredItem[]): string {
  if (scoredItems.length === 0) return ''

  const lines: string[] = [`## ${entityName}`]

  const edges = scoredItems.filter(i => i.type === 'edge')
  const events = scoredItems.filter(i => i.type === 'event')
  const vectors = scoredItems.filter(i => i.type === 'vector')

  if (edges.length > 0) {
    lines.push(`Relationships: ${edges.map(e => e.description).join('; ')}`)
  }
  if (events.length > 0) {
    lines.push(`Recent events: ${events.map(e => e.description).join('; ')}`)
  }
  if (vectors.length > 0) {
    lines.push(`Related: ${vectors.map(v => v.description).join('; ')}`)
  }

  return lines.join('\n')
}

/**
 * Graph-aware proactive recall — primary function.
 * Retrieves neighborhood, events, and optional vector matches for each entity,
 * scores and ranks items, formats within a 1500 token budget.
 */
export async function graphAwareRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityNodeIds: string[],
  queryEmbedding?: number[],
): Promise<GraphAwareRecallResult[]> {
  if (entityNodeIds.length === 0) return []

  const results: GraphAwareRecallResult[] = []
  const seenDescriptions = new Set<string>()
  let totalTokens = 0

  // ── Spreading activation: fire from each mentioned entity ──
  const activationMap = new Map<string, number>()
  for (const entityId of entityNodeIds) {
    try {
      const activations = await activate(supabase, orgId, entityId, { maxDepth: 2, decayFactor: 0.7 })
      for (const ar of activations) {
        const existing = activationMap.get(ar.entityId) ?? 0
        activationMap.set(ar.entityId, Math.max(existing, ar.activation))
      }
    } catch (err) {
      logger.warn('[proactive-recall] spreading activation failed for entity', {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Hebbian strengthening for co-occurring entity pairs (fire-and-forget) ──
  if (entityNodeIds.length >= 2) {
    for (let i = 0; i < entityNodeIds.length; i++) {
      for (let j = i + 1; j < entityNodeIds.length; j++) {
        // Intentionally not awaited — fire-and-forget
        strengthen(supabase, orgId, entityNodeIds[i], entityNodeIds[j])
      }
    }
  }

  for (const entityId of entityNodeIds.slice(0, 3)) {
    if (totalTokens >= MAX_RECALL_TOKENS) break

    try {
      const scoredItems: ScoredItem[] = []

      // 1. Get neighborhood (edges + neighbors)
      const neighborhood = await getNeighborhood(supabase, orgId, entityId)
      if (!neighborhood) continue // No graph data for this entity

      const entityName = neighborhood.node.name
      const neighborMap = new Map(neighborhood.neighbors.map(n => [n.id, n.name]))

      for (const edge of neighborhood.edges) {
        const neighborId = edge.source_id === entityId ? edge.target_id : edge.source_id
        const neighborName = neighborMap.get(neighborId) ?? 'unknown'
        const item = scoreEdge(edge, neighborName, entityId)
        if (!seenDescriptions.has(item.description)) {
          seenDescriptions.add(item.description)
          scoredItems.push(item)
        }
      }

      // 2. Get events from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const events = await getEntityEvents(supabase, orgId, entityId, { from: thirtyDaysAgo })

      for (const event of events) {
        const item = scoreEvent(event)
        if (!seenDescriptions.has(item.description)) {
          seenDescriptions.add(item.description)
          scoredItems.push(item)
        }
      }

      // 3. Optional vector search
      if (queryEmbedding) {
        const vectorMatches = await vectorSearchEntities(supabase, orgId, queryEmbedding, 5)
        for (const match of vectorMatches) {
          if (match.id === entityId) continue // Skip self
          const item = scoreVectorMatch(match)
          if (!seenDescriptions.has(item.description)) {
            seenDescriptions.add(item.description)
            scoredItems.push(item)
          }
        }
      }

      // Boost scores using spreading activation results
      for (const item of scoredItems) {
        if (item.type === 'edge') {
          // Extract neighbor entity from description (edges reference neighbors)
          // Check all activated entities for a match
          for (const [activatedId, activationLevel] of activationMap) {
            const neighborId = (() => {
              for (const edge of neighborhood.edges) {
                const nId = edge.source_id === entityId ? edge.target_id : edge.source_id
                const nName = neighborMap.get(nId) ?? ''
                if (item.description.includes(nName) && nId === activatedId) return nId
              }
              return null
            })()
            if (neighborId) {
              item.blendedScore *= (1 + activationLevel)
              break
            }
          }
        }
      }

      // Sort by blended score descending
      scoredItems.sort((a, b) => b.blendedScore - a.blendedScore)

      // Format and check budget
      const formattedText = formatGraphResult(entityName, scoredItems)
      const tokenEstimate = estimateTokens(formattedText)

      if (tokenEstimate > 0 && totalTokens + tokenEstimate <= MAX_RECALL_TOKENS) {
        results.push({
          entityId,
          entityName,
          formattedText,
          tokenEstimate,
          scoredItems,
        })
        totalTokens += tokenEstimate
      } else if (tokenEstimate > 0) {
        // Trim items to fit remaining budget
        const remainingBudget = MAX_RECALL_TOKENS - totalTokens
        const trimmedItems = [...scoredItems]
        let trimmedText = formatGraphResult(entityName, trimmedItems)

        while (estimateTokens(trimmedText) > remainingBudget && trimmedItems.length > 1) {
          trimmedItems.pop()
          trimmedText = formatGraphResult(entityName, trimmedItems)
        }

        if (estimateTokens(trimmedText) <= remainingBudget && trimmedItems.length > 0) {
          results.push({
            entityId,
            entityName,
            formattedText: trimmedText,
            tokenEstimate: estimateTokens(trimmedText),
            scoredItems: trimmedItems,
          })
          totalTokens += estimateTokens(trimmedText)
        }
      }
    } catch (err) {
      logger.warn('[proactive-recall] graphAwareRecall failed for entity', {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

// ─── Legacy Proactive Recall (Backwards Compat) ─────────────────────────────

/**
 * Legacy proactive recall — renamed from original proactiveRecall.
 * Uses memory_palace_entries, decision_log, and memory_patterns tables.
 * @deprecated Use graphAwareRecall instead
 */
export async function legacyProactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<ProactiveRecallResult[]> {
  if (entityIds.length === 0) return []

  const results: ProactiveRecallResult[] = []
  let totalTokens = 0

  for (const entityId of entityIds.slice(0, 3)) {
    if (totalTokens >= LEGACY_MAX_TOKENS) break

    try {
      const recall = await recallForEntity(supabase, orgId, entityId)
      if (recall.tokenEstimate > 0) {
        results.push(recall)
        totalTokens += recall.tokenEstimate
      }
    } catch (err) {
      logger.warn('[proactive-recall] Legacy failed for entity', {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/**
 * Main entry point — tries graph-aware recall first, falls back to legacy.
 * This is the function imported by context-assembler as `recallForContext`.
 */
export async function proactiveRecall(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
  threadId?: string,
): Promise<ProactiveRecallResult[]> {
  const results: ProactiveRecallResult[] = []

  if (entityIds.length > 0) {
    // Priority: Retrieve fiduciary constraints FIRST (D-08: higher priority than standard memories)
    try {
      const fiduciaryResults = await recallFiduciaryConstraints(supabase, orgId, entityIds)
      if (fiduciaryResults.length > 0) {
        results.push(...fiduciaryResults)
      }
    } catch (err) {
      logger.warn('[proactive-recall] Fiduciary constraint recall failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Then standard graph-aware recall
    try {
      const graphResults = await graphAwareRecall(supabase, orgId, entityIds)
      if (graphResults.length > 0) {
        // Adapt GraphAwareRecallResult to ProactiveRecallResult for compatibility
        results.push(...graphResults.map(r => ({
          entityId: r.entityId,
          entityName: r.entityName,
          memories: [],
          decisions: [],
          patterns: [],
          formattedText: r.formattedText,
          tokenEstimate: r.tokenEstimate,
          scoredItems: r.scoredItems,
        })))
      }
    } catch (err) {
      logger.warn('[proactive-recall] Graph recall failed, falling back to legacy', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Fallback to legacy if graph returned nothing
    if (results.length === 0) {
      const legacyResults = await legacyProactiveRecall(supabase, orgId, entityIds)
      results.push(...legacyResults)
    }
  }

  // Surface any active plans for this thread
  if (threadId) {
    try {
      const { data: activePlans } = await supabase
        .from('memory_palace_entries')
        .select('id, title, content, metadata')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .eq('source_thread_id', threadId)
        .eq('category', 'pattern')
        .filter('metadata->>plan_type', 'eq', 'taor_execution')
        .filter('metadata->>status', 'eq', 'active')
        .order('created_at', { ascending: false })
        .limit(1)

      if (activePlans && activePlans.length > 0) {
        const plan = activePlans[0]
        let stageLabels = plan.title ?? 'Unknown plan'
        try {
          const planContent = JSON.parse(plan.content)
          stageLabels = planContent.stages.map((s: { label: string }) => s.label).join(' -> ')
        } catch {}

        results.push({
          entityId: 'plan',
          entityName: 'Current Objectives',
          memories: [],
          decisions: [],
          patterns: [],
          formattedText: `## Active Plan\n${plan.title}\nStages: ${stageLabels}`,
          tokenEstimate: Math.ceil(stageLabels.length / 3.5) + 20,
        })
      }
    } catch {}
  }

  return results
}

/**
 * Format proactive recall results as a system prompt section.
 * Works with both new GraphAwareRecallResult and legacy ProactiveRecallResult.
 */
export function formatProactiveRecall(results: ProactiveRecallResult[]): string {
  if (results.length === 0) return ''

  const sections: string[] = ['<memory-context>']

  for (const r of results) {
    if (r.formattedText.length === 0) continue
    sections.push(r.formattedText)
  }

  sections.push('</memory-context>')

  // If only wrapper tags and no content, return empty
  if (sections.length <= 2) return ''

  return sections.join('\n')
}

// ─── Legacy Internal ─────────────────────────────────────────────────────────

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

  for (const mem of recall.memories) {
    const conf = Math.round(mem.confidence * 100)
    const tag = mem.category === 'pricing' ? '$' :
      mem.category === 'convention' ? '!' :
      mem.category === 'relationship' ? '~' :
      mem.category === 'decision' ? '>' :
      '-'
    lines.push(`  ${tag} ${mem.content.slice(0, 120)} (${conf}%)`)
  }

  for (const dec of recall.decisions) {
    const date = new Date(dec.decided_at).toLocaleDateString('en-AU', {
      month: 'short',
      day: 'numeric',
    })
    lines.push(`  > Decision (${date}): ${dec.title} — ${dec.decision.slice(0, 80)}`)
  }

  for (const pat of recall.patterns) {
    const conf = Math.round(pat.confidence * 100)
    lines.push(`  ~ Pattern: ${pat.description.slice(0, 100)} (${conf}%, n=${pat.sample_count})`)
  }

  return lines.join('\n')
}

// ─── Fiduciary Constraint Recall ────────────────────────────────────────────

const MAX_FIDUCIARY_TOKENS = 200 // ~200 tokens reserved for fiduciary constraints per turn

async function recallFiduciaryConstraints(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<ProactiveRecallResult[]> {
  const results: ProactiveRecallResult[] = []
  let totalTokens = 0

  for (const entityId of entityIds.slice(0, 3)) {
    if (totalTokens >= MAX_FIDUCIARY_TOKENS) break

    const { data: constraints } = await supabase
      .from('memory_palace_entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('category', 'fiduciary_constraint')
      .eq('is_active', true)
      .contains('entity_ids', [entityId])
      .gte('confidence', MIN_RECALL_CONFIDENCE)
      .order('confidence', { ascending: false })
      .limit(3)

    if (!constraints || constraints.length === 0) continue

    // Extract entity name from first constraint
    const entityName = constraints[0].entity_names?.[
      constraints[0].entity_ids.indexOf(entityId)
    ] ?? entityId.slice(0, 8)

    const lines: string[] = [`[${entityName} - Fiduciary]`]
    for (const c of constraints) {
      lines.push(`  [!] ${c.content.slice(0, 200)}`)
    }

    const formattedText = lines.join('\n')
    const tokenEstimate = estimateTokens(formattedText)

    if (totalTokens + tokenEstimate <= MAX_FIDUCIARY_TOKENS) {
      results.push({
        entityId,
        entityName,
        memories: constraints as MemoryPalaceEntry[],
        decisions: [],
        patterns: [],
        formattedText,
        tokenEstimate,
      })
      totalTokens += tokenEstimate
    }
  }

  return results
}
