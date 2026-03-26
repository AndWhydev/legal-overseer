/**
 * Draft Context Assembler — Gathers all business context for drafting a reply.
 *
 * Replaces the context-free LLM drafting path with business-aware context:
 * contact briefing, conversation history, memory palace, RAG context,
 * standing orders, relationship score, and confidence scoring.
 *
 * All sources are fetched in parallel via Promise.all with never-throw wrappers.
 * Token budget (~4000 tokens) is enforced with priority-based truncation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { getBaseplateSnapshot, type BaseplateSnapshot } from '@/lib/context/baseplate-snapshot'
import { proactiveRecall, formatProactiveRecall } from '@/lib/memory-palace/proactive-recall'
import { searchVectors, formatChunksForContext } from '@/lib/rag/retriever'
import {
  getActiveOrders,
  matchOrdersToContext,
  formatOrdersForPrompt,
  type StandingOrder,
} from '@/lib/intelligence/standing-orders'
import {
  computeRelationshipStrength,
  type RelationshipTrend,
  type RelationshipScore,
} from '@/lib/intelligence/relationship-scorer'
import {
  analyzeContactTiming,
  type OptimalContactWindow,
  type ContactTimingResult,
} from '@/lib/intelligence/contact-timing'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DraftContext {
  contactBriefing: string
  conversationHistory: string
  memoryRecall: string
  ragContext: string
  standingOrders: string
  relationshipScore: number
  relationshipTrend: RelationshipTrend
  confidenceScore: number
  metadata: DraftContextMetadata
}

export interface DraftContextMetadata {
  assemblyTimeMs: number
  sourcesAvailable: {
    baseplate: boolean
    history: boolean
    memories: boolean
    rag: boolean
    orders: boolean
    relationship: boolean
  }
  tokenEstimate: number
  optimalSendWindow?: OptimalContactWindow
}

// ─── Token Budget Constants ─────────────────────────────────────────────────

/** Total token budget for all context sources combined. */
const TOTAL_TOKEN_BUDGET = 4000

/**
 * Token allocations by priority (highest priority = last to be truncated).
 * Priority 1 (highest) = conversation history, truncated last.
 */
const TOKEN_ALLOCATIONS = {
  conversationHistory: { budget: 1200, priority: 1 },
  contactBriefing: { budget: 1000, priority: 2 },
  ragContext: { budget: 800, priority: 5 },
  memoryRecall: { budget: 600, priority: 4 },
  standingOrders: { budget: 400, priority: 3 },
} as const

type ContextField = keyof typeof TOKEN_ALLOCATIONS

// ─── Main Assembly Function ─────────────────────────────────────────────────

/**
 * Assemble all context needed for drafting a reply to a specific contact.
 *
 * Fetches all sources in parallel. Any individual failure degrades gracefully
 * to empty/default values without throwing.
 */
export async function assembleDraftContext(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  contactName: string,
  incomingMessage: string,
  channel: string,
): Promise<DraftContext> {
  const startTime = Date.now()

  // Fetch ALL sources in parallel with never-throw wrappers
  const [
    baseplateResult,
    recallResult,
    ragResult,
    ordersResult,
    relationshipResult,
    historyResult,
    timingResult,
  ] = await Promise.all([
    safeCall(() => getBaseplateSnapshot(supabase, orgId, 'contact', contactId), null),
    safeCall(() => proactiveRecall(supabase, orgId, [contactId]), []),
    safeCall(() => searchVectors({ query: incomingMessage, orgId, topK: 5 }), []),
    safeCall(() => getActiveOrders(supabase, orgId), []),
    safeCall(() => computeRelationshipStrength(supabase, orgId, contactId), null),
    safeCall(() => loadContactMessageHistory(supabase, orgId, contactId, 10), ''),
    safeCall(() => analyzeContactTiming(supabase, orgId, contactId), null),
  ])

  // Filter standing orders via matchOrdersToContext
  const filteredOrders = matchOrdersToContext(ordersResult as StandingOrder[], {
    sender: contactName,
    channel,
  })

  // Format each source
  const rawContactBriefing = formatBaseplateForDraft(baseplateResult as BaseplateSnapshot | null)
  const rawMemoryRecall = formatProactiveRecall(recallResult as Awaited<ReturnType<typeof proactiveRecall>>)
  const rawRagContext = formatChunksForContext(ragResult as Awaited<ReturnType<typeof searchVectors>>)
  const rawStandingOrders = formatOrdersForPrompt(filteredOrders)
  const rawConversationHistory = historyResult as string

  // Extract relationship data (with defaults for failure case)
  const relScore = relationshipResult as RelationshipScore | null
  const relationshipScore = relScore?.strength ?? 0
  const relationshipTrend: RelationshipTrend = relScore?.trend ?? 'cold'

  // Extract timing data
  const timing = timingResult as ContactTimingResult | null
  const optimalSendWindow = timing?.windows?.[0] ?? undefined

  // Apply token budgeting
  const budgeted = applyTokenBudget({
    conversationHistory: rawConversationHistory,
    contactBriefing: rawContactBriefing,
    ragContext: rawRagContext,
    memoryRecall: rawMemoryRecall,
    standingOrders: rawStandingOrders,
  })

  // Build sources-available flags
  const sourcesAvailable = {
    baseplate: baseplateResult != null,
    history: rawConversationHistory.length > 0,
    memories: rawMemoryRecall.length > 0,
    rag: rawRagContext.length > 0,
    orders: filteredOrders.length > 0,
    relationship: relScore != null,
  }

  // Compute total token estimate from budgeted output
  const tokenEstimate = estimateTokens(
    budgeted.conversationHistory +
    budgeted.contactBriefing +
    budgeted.ragContext +
    budgeted.memoryRecall +
    budgeted.standingOrders,
  )

  const assemblyTimeMs = Date.now() - startTime

  const draftContext: DraftContext = {
    contactBriefing: budgeted.contactBriefing,
    conversationHistory: budgeted.conversationHistory,
    memoryRecall: budgeted.memoryRecall,
    ragContext: budgeted.ragContext,
    standingOrders: budgeted.standingOrders,
    relationshipScore,
    relationshipTrend,
    confidenceScore: 0, // placeholder, computed below
    metadata: {
      assemblyTimeMs,
      sourcesAvailable,
      tokenEstimate,
      optimalSendWindow,
    },
  }

  // Compute confidence score based on context depth
  draftContext.confidenceScore = computeDraftConfidence(draftContext)

  logger.debug('[draft-context-assembler] Assembled context', {
    contactId,
    assemblyTimeMs,
    tokenEstimate,
    confidenceScore: draftContext.confidenceScore,
    sourcesAvailable,
  })

  return draftContext
}

// ─── Conversation History Loader ────────────────────────────────────────────

/**
 * Load the most recent messages for a contact from channel_messages.
 * Returns formatted chronological thread.
 */
export async function loadContactMessageHistory(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  limit: number,
): Promise<string> {
  const { data, error } = await supabase
    .from('channel_messages')
    .select('sender_name, body, received_at, channel')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (error || !data || data.length === 0) return ''

  // Reverse to chronological order (oldest first)
  const messages = [...data].reverse()

  return messages
    .map((msg) => {
      const date = formatShortDate(msg.received_at)
      const senderName = msg.sender_name ?? 'Unknown'
      const body = truncateText(msg.body ?? '', 300)
      return `[${date} via ${msg.channel ?? 'unknown'}] ${senderName}: ${body}`
    })
    .join('\n')
}

// ─── Baseplate Formatter ────────────────────────────────────────────────────

/**
 * Format a BaseplateSnapshot into readable text for draft context.
 */
export function formatBaseplateForDraft(snapshot: BaseplateSnapshot | null): string {
  if (!snapshot) return ''

  const sections: string[] = []
  const profile = snapshot.profile

  // Recent events summary
  if (profile.event_summary.total > 0) {
    sections.push(
      `Activity: ${profile.event_summary.total} events across ${profile.event_summary.channels.join(', ')}` +
      (profile.event_summary.last_event_at ? ` (last: ${formatShortDate(profile.event_summary.last_event_at)})` : ''),
    )
  }

  // Memories (key facts about this contact)
  if (profile.memories.length > 0) {
    const memLines = profile.memories
      .slice(0, 5)
      .map((m) => `- ${m.fact}`)
    sections.push('Key facts:\n' + memLines.join('\n'))
  }

  // Relationship context
  if (profile.relationship_context) {
    const rc = profile.relationship_context

    if (rc.related_people.length > 0) {
      const people = rc.related_people
        .slice(0, 3)
        .map((p) => `${p.name} (${p.connection_type})`)
        .join(', ')
      sections.push(`Connected to: ${people}`)
    }

    if (rc.topics.length > 0) {
      const topics = rc.topics
        .slice(0, 5)
        .map((t) => t.name)
        .join(', ')
      sections.push(`Topics: ${topics}`)
    }
  }

  // Relationships (entity links)
  if (profile.relationships.length > 0) {
    const rels = profile.relationships
      .slice(0, 3)
      .map((r) => `${r.type} -> ${r.target_type}`)
      .join(', ')
    sections.push(`Relationships: ${rels}`)
  }

  return sections.join('\n')
}

// ─── Confidence Scoring ─────────────────────────────────────────────────────

/**
 * Compute confidence score (0.15 - 0.95) based on context depth.
 *
 * Higher scores mean more context is available, enabling better drafts.
 * Base score of 0.40 assumes we have the incoming message and voice profile.
 */
export function computeDraftConfidence(ctx: DraftContext): number {
  let score = 0.40 // base score

  // Positive modifiers (additive)
  if (ctx.conversationHistory.length > 0) score += 0.15
  if (ctx.contactBriefing.length > 100) score += 0.15
  if (ctx.memoryRecall.length > 0) score += 0.10
  if (ctx.ragContext.length > 0) score += 0.10
  if (ctx.standingOrders.length > 0) score += 0.05
  if (ctx.relationshipScore > 50) score += 0.05

  // Negative modifiers
  if (!ctx.metadata.sourcesAvailable.baseplate && ctx.conversationHistory.length === 0) {
    score -= 0.10
  }
  if (ctx.relationshipScore < 20) {
    score -= 0.05
  }

  // Cap and floor
  score = Math.min(score, 0.95)
  score = Math.max(score, 0.15)

  return Math.round(score * 100) / 100
}

// ─── Token Budgeting ────────────────────────────────────────────────────────

interface ContextTexts {
  conversationHistory: string
  contactBriefing: string
  ragContext: string
  memoryRecall: string
  standingOrders: string
}

/**
 * Apply token budget to context sources.
 * Truncates lowest-priority sources first if total exceeds budget.
 */
function applyTokenBudget(texts: ContextTexts): ContextTexts {
  const result = { ...texts }

  // First pass: enforce per-source budgets
  for (const [field, config] of Object.entries(TOKEN_ALLOCATIONS)) {
    const key = field as ContextField
    const currentTokens = estimateTokens(result[key])
    if (currentTokens > config.budget) {
      result[key] = truncateToTokens(result[key], config.budget)
    }
  }

  // Second pass: if total still exceeds budget, truncate from lowest priority
  let totalTokens = Object.keys(TOKEN_ALLOCATIONS).reduce(
    (sum, key) => sum + estimateTokens(result[key as ContextField]),
    0,
  )

  if (totalTokens > TOTAL_TOKEN_BUDGET) {
    // Sort fields by priority (highest number = lowest priority = truncated first)
    const fieldsByPriority = (Object.entries(TOKEN_ALLOCATIONS) as [ContextField, { budget: number; priority: number }][])
      .sort((a, b) => b[1].priority - a[1].priority)

    for (const [field] of fieldsByPriority) {
      if (totalTokens <= TOTAL_TOKEN_BUDGET) break

      const fieldTokens = estimateTokens(result[field])
      const excess = totalTokens - TOTAL_TOKEN_BUDGET
      const toRemove = Math.min(fieldTokens, excess)

      if (toRemove > 0) {
        const newBudget = Math.max(0, fieldTokens - toRemove)
        result[field] = truncateToTokens(result[field], newBudget)
        totalTokens -= toRemove
      }
    }
  }

  return result
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Estimate token count using char/4 heuristic. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Truncate text to approximately the given token count. */
function truncateToTokens(text: string, tokenBudget: number): string {
  const charLimit = tokenBudget * 4
  if (text.length <= charLimit) return text
  return text.slice(0, charLimit)
}

/** Truncate a string to maxLen, appending '...' if truncated. */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

/** Format an ISO date to short format like "Mar 15". */
function formatShortDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  } catch {
    return isoDate
  }
}

/**
 * Safely call an async function, returning a default value on error.
 * Implements the never-throw pattern for parallel context fetching.
 */
async function safeCall<T>(fn: () => Promise<T>, defaultValue: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.debug('[draft-context-assembler] Source fetch failed (non-critical)', {
      error: err instanceof Error ? err.message : String(err),
    })
    return defaultValue
  }
}
