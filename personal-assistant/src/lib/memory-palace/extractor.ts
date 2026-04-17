/**
 * Memory Palace — Enhanced Memory Extractor
 *
 * Extends the existing MemoryConsolidator to extract typed memories
 * (decisions, facts, patterns, pricing) not just flat facts.
 * Runs as fire-and-forget post-response processing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger'
import { createMemoryPalace } from './service'
// MemoryType is a superset of MemoryCategory that includes service-level types
type MemoryType = 'conversation' | 'decision' | 'pattern' | 'fact' | 'relationship' | 'pricing' | 'convention' | 'lesson_learned'

// ─── Signal Detection ───────────────────────────────────────────────────────

const DECISION_SIGNALS = /\b(decided|agreed|confirmed|approved|rejected|chose|selected|went with|let's go with|we'll|we should)\b/i
const PRICING_SIGNALS = /\b(\$[\d,]+(\.\d{2})?|per hour|hourly rate|fixed price|quote|estimate|budget)\b/i
const PATTERN_SIGNALS = /\b(always|usually|typically|tends to|pattern|every time|whenever)\b/i
const RELATIONSHIP_SIGNALS = /\b(works? (with|for|at)|reports? to|client of|partner|introduced|referred)\b/i
const LESSON_SIGNALS = /\b(learned|mistake|should have|next time|won't|never again|lesson)\b/i
const FACT_SIGNALS = /\b(is a|works at|located in|founded|established|specializes|address|email|phone)\b/i

export interface ExtractionContext {
  orgId: string
  threadId: string
  userMessage: string
  assistantMessage: string
  entityIds: string[]
  entityNames: string[]
  channel?: string
}

interface ExtractedMemory {
  memory_type: MemoryType
  title: string
  content: string
  type_metadata: Record<string, unknown>
  confidence: number
}

// ─── Extraction Prompt ──────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Extract institutional knowledge from this conversation turn. Return ONLY valid JSON.

CONVERSATION:
User: {USER_MESSAGE}
Assistant: {ASSISTANT_MESSAGE}

KNOWN ENTITIES: {ENTITY_NAMES}

Extract memories into these categories:
- "decision": A business decision was made (what, why, alternatives considered)
- "pricing": Pricing information mentioned (amounts, rates, quotes)
- "fact": A concrete fact about a person, company, or project
- "relationship": A connection between people/organizations
- "pattern": A recurring behavior or tendency
- "lesson_learned": Something learned from experience
- "conversation": Key takeaway worth remembering from this exchange

Return JSON:
{
  "memories": [
    {
      "memory_type": "decision|pricing|fact|relationship|pattern|lesson_learned|conversation",
      "title": "Short descriptive title (max 80 chars)",
      "content": "Full description of the memory with all relevant details",
      "type_metadata": {},
      "confidence": 0.0-1.0
    }
  ]
}

For type_metadata, include type-specific fields:
- decision: {"alternatives": [{"option":"...", "pros":["..."], "cons":["..."]}], "reasoning_chain": "...", "domain": "pricing|hiring|technical|client|..."}
- pricing: {"amount": 0, "currency": "AUD", "project_type": "...", "scope": "..."}
- fact: {"fact_type": "financial|contact_info|preference|status", "verified": false}
- relationship: {"relationship_type": "works_with|reports_to|client_of|...", "parties": ["..."]}
- pattern: {"pattern_type": "...", "sample_count": 1, "pattern_data": {}}
- lesson_learned: {"context": "...", "what_happened": "...", "what_we_learned": "...", "applies_to": ["..."]}

Return {"memories": []} if no significant institutional knowledge found.`

// ─── Memory Extractor ───────────────────────────────────────────────────────

export class MemoryExtractor {
  private anthropic: Anthropic

  constructor() {
    this.anthropic = new Anthropic()
  }

  /**
   * Detect which memory types might be present in the conversation turn.
   * Uses fast regex scanning (~5ms) to avoid unnecessary Haiku calls.
   */
  detectSignals(text: string): MemoryType[] {
    const types: MemoryType[] = []
    if (DECISION_SIGNALS.test(text)) types.push('decision')
    if (PRICING_SIGNALS.test(text)) types.push('pricing')
    if (PATTERN_SIGNALS.test(text)) types.push('pattern')
    if (RELATIONSHIP_SIGNALS.test(text)) types.push('relationship')
    if (LESSON_SIGNALS.test(text)) types.push('lesson_learned')
    if (FACT_SIGNALS.test(text)) types.push('fact')
    return types
  }

  /**
   * Extract typed memories from a conversation turn.
   * Fire-and-forget: called async after response is sent.
   */
  async extractAndStore(
    supabase: SupabaseClient,
    ctx: ExtractionContext,
  ): Promise<number> {
    const combinedText = `${ctx.userMessage} ${ctx.assistantMessage}`
    const signals = this.detectSignals(combinedText)

    if (signals.length === 0) {
      logger.debug('[memory-extractor] No memory signals detected', {
        threadId: ctx.threadId,
      })
      return 0
    }

    try {
      const memories = await this.extractViaLLM(ctx)
      if (memories.length === 0) return 0

      const palace = createMemoryPalace(supabase, ctx.orgId)
      let stored = 0

      for (const mem of memories) {
        if (mem.memory_type === 'decision') {
          const meta = mem.type_metadata as Record<string, unknown>
          const id = await palace.createDecision({
            decisionSummary: mem.title,
            content: mem.content,
            alternatives: (meta.alternatives as Array<{ option: string; pros: string[]; cons: string[] }>) ?? [],
            reasoningChain: (meta.reasoning_chain as string) ?? '',
            domain: (meta.domain as string) ?? undefined,
            participants: ctx.entityNames,
            entityIds: ctx.entityIds,
            entityNames: ctx.entityNames,
            sourceThreadId: ctx.threadId,
          })
          if (id) stored++
        } else {
           
          const id = await palace.createMemory({
            memoryType: mem.memory_type as any,
            title: mem.title,
            content: mem.content,
            typeMetadata: mem.type_metadata,
            confidence: mem.confidence,
            sourceType: 'extraction',
            sourceThreadId: ctx.threadId,
            sourceChannel: ctx.channel,
            entityIds: ctx.entityIds,
            entityNames: ctx.entityNames,
          })
          if (id) stored++
        }
      }

      logger.info('[memory-extractor] Extracted and stored memories', {
        threadId: ctx.threadId,
        signals: signals.length,
        extracted: memories.length,
        stored,
      })

      return stored
    } catch (err) {
      logger.error('[memory-extractor] extractAndStore failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: ctx.threadId,
      })
      return 0
    }
  }

  /**
   * Call Haiku to extract structured memories from a conversation turn.
   */
  private async extractViaLLM(ctx: ExtractionContext): Promise<ExtractedMemory[]> {
    const prompt = EXTRACTION_PROMPT
      .replace('{USER_MESSAGE}', ctx.userMessage.slice(0, 2000))
      .replace('{ASSISTANT_MESSAGE}', ctx.assistantMessage.slice(0, 2000))
      .replace('{ENTITY_NAMES}', ctx.entityNames.length > 0 ? ctx.entityNames.join(', ') : '(none detected)')

    try {
      const response = await this.anthropic.messages.create({
        model: resolveModel('classification'),
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return []

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0]) as {
        memories: ExtractedMemory[]
      }

      if (!Array.isArray(parsed.memories)) return []

      // Validate and filter
      const validTypes = new Set<string>([
        'conversation', 'decision', 'pattern', 'fact',
        'relationship', 'pricing', 'lesson_learned',
      ])

      return parsed.memories.filter(m =>
        validTypes.has(m.memory_type) &&
        m.title &&
        m.content &&
        (m.confidence ?? 0.5) >= 0.3,
      ).map(m => ({
        ...m,
        confidence: m.confidence ?? 0.5,
        type_metadata: m.type_metadata ?? {},
      }))
    } catch (err) {
      logger.warn('[memory-extractor] LLM extraction failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }
}

// Singleton for reuse
let extractorInstance: MemoryExtractor | null = null

export function getMemoryExtractor(): MemoryExtractor {
  if (!extractorInstance) {
    extractorInstance = new MemoryExtractor()
  }
  return extractorInstance
}
