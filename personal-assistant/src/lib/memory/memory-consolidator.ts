/**
 * Memory Consolidator — Per-turn fact extraction and baseplate updates.
 *
 * Processes each conversation turn asynchronously (fire-and-forget) to:
 * 1. Detect entity mentions via fast string matching (~10ms)
 * 2. Scan for high-value signals via regex (~5ms)
 * 3. Extract structured facts via Haiku (only when high-value signals found, ~500ms)
 * 4. Detect contradictions with existing semantic_memories
 * 5. Write to Context Baseplate (semantic_memories, entity_timeline, xref cache)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger'
import type { ConversationMessageRecord, KeyFact } from '@/lib/conversation/types'
import {
  scanForEntityMentions,
  type ScanContact,
  type MentionMatch,
} from '@/lib/context/entity-mention-scanner'
import { writeTimelineEvent } from '@/lib/context/timeline-writer'
import { invalidateCrossRefs } from '@/lib/context/xref-cache'
import { computeEntityProfile } from '@/lib/context/entity-profile-builder'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  entities: ExtractedEntity[]
  facts: ExtractedFact[]
  contradictions: Contradiction[]
}

export interface ExtractedEntity {
  entityId: string | null
  entityName: string
  entityType: string
  newFacts: string[]
}

export interface ExtractedFact {
  type: KeyFact['type']
  text: string
  entityNames: string[]
  importance: number
}

export interface Contradiction {
  existingFact: string
  existingFactId: string
  newFact: string
  entityId: string
  resolution: 'new_supersedes' | 'needs_review' | 'coexist'
}

// ─── High-Value Signal Patterns ─────────────────────────────────────────────

const DOLLAR_AMOUNT = /\$[\d,]+(\.\d{2})?/
const DATE_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i
const COMMITMENT_PATTERN = /\b(will|promise|commit|guarantee|by next|by monday|by tuesday|by wednesday|by thursday|by friday|by saturday|by sunday|by end of)\b/i
const DECISION_PATTERN = /\b(decided|agreed|confirmed|approved|rejected|chose|selected|went with)\b/i

function hasHighValueSignals(text: string): boolean {
  return (
    DOLLAR_AMOUNT.test(text) ||
    DATE_PATTERN.test(text) ||
    COMMITMENT_PATTERN.test(text) ||
    DECISION_PATTERN.test(text)
  )
}

// ─── Prompt Template ────────────────────────────────────────────────────────

const ENTITY_FACT_EXTRACTION_PROMPT = `Extract facts about entities mentioned in this conversation turn. Return ONLY valid JSON.

TURN:
User: {USER_MESSAGE}
Assistant: {ASSISTANT_MESSAGE}

KNOWN ENTITIES IN THIS CONVERSATION:
{ENTITY_NAMES_LIST}

Return JSON:
{
  "facts": [
    {
      "entity_name": "Name",
      "fact": "concise factual statement",
      "type": "financial|commitment|decision|entity_state|action_item|deadline",
      "importance": 0.0-1.0
    }
  ]
}

Importance scale:
- 1.0: Financial (amounts, payment status, invoices)
- 0.9: Deadlines and commitments
- 0.8: Decisions made
- 0.7: Status changes
- 0.5: Preferences and patterns
- 0.3: Casual mentions

Return {"facts": []} if no significant entity facts.`

const CONTRADICTION_CHECK_PROMPT = `Do these two facts contradict each other? Answer with ONLY "yes" or "no".

Existing fact: {EXISTING_FACT}
New fact: {NEW_FACT}

Answer:`

// ─── MemoryConsolidator ─────────────────────────────────────────────────────

export class MemoryConsolidator {
  private supabase: SupabaseClient
  private anthropic: Anthropic

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
    this.anthropic = new Anthropic()
  }

  /**
   * Process a new conversation turn: extract entities and facts.
   * ASYNC — fire-and-forget after response sent.
   * Skips Haiku call if no high-value signals detected.
   */
  async processNewTurn(
    orgId: string,
    threadId: string,
    turn: ConversationMessageRecord,
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = { entities: [], facts: [], contradictions: [] }

    try {
      // 1. Entity detection via fast string matching (~10ms)
      const scanContacts = await this.loadScanContacts(orgId)
      const mentions = scanForEntityMentions(turn.content, scanContacts, 10)

      result.entities = mentions.map(m => ({
        entityId: m.contactId,
        entityName: m.contactName,
        entityType: 'contact',
        newFacts: [],
      }))

      // Record entity mentions on timeline
      for (const mention of mentions) {
        writeTimelineEvent(
          this.supabase,
          orgId,
          'contact',
          mention.contactId,
          'mention',
          { thread_id: threadId, turn_number: turn.turn_number, channel: turn.channel },
          turn.channel,
        ).catch(() => {}) // fire-and-forget
      }

      // 2. High-value signal detection (~5ms, regex-based)
      if (!hasHighValueSignals(turn.content)) {
        logger.debug('[memory-consolidator] No high-value signals, skipping Haiku', {
          threadId,
          turnNumber: turn.turn_number,
        })
        return result
      }

      // 3. Fact extraction via Haiku (~500ms) — only when signals detected
      result.facts = await this.extractFacts(turn, mentions)

      // 4. Contradiction detection
      if (result.facts.length > 0) {
        const entityIds = mentions.map(m => m.contactId)
        result.contradictions = await this.detectContradictions(
          orgId,
          result.facts,
          entityIds,
        )
      }

      // 5. Write to Context Baseplate
      if (result.facts.length > 0 || result.contradictions.length > 0) {
        await this.consolidateToBaseplate(orgId, result)
      }

      logger.info('[memory-consolidator] Processed turn', {
        threadId,
        turnNumber: turn.turn_number,
        entities: result.entities.length,
        facts: result.facts.length,
        contradictions: result.contradictions.length,
      })
    } catch (err) {
      logger.error('[memory-consolidator] processNewTurn failed', {
        threadId,
        turnNumber: turn.turn_number,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return result
  }

  /**
   * Extract structured facts from a turn via Haiku.
   */
  private async extractFacts(
    turn: ConversationMessageRecord,
    mentions: MentionMatch[],
  ): Promise<ExtractedFact[]> {
    // We need both a user and assistant message for best context.
    // The turn itself may be either role; use the content directly.
    const entityNamesList = mentions.length > 0
      ? mentions.map(m => m.contactName).join(', ')
      : '(none detected)'

    const prompt = ENTITY_FACT_EXTRACTION_PROMPT
      .replace('{USER_MESSAGE}', turn.role === 'user' ? turn.content : '(see assistant message)')
      .replace('{ASSISTANT_MESSAGE}', turn.role === 'assistant' ? turn.content : '(see user message)')
      .replace('{ENTITY_NAMES_LIST}', entityNamesList)

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return []

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0]) as {
        facts: Array<{
          entity_name?: string
          fact: string
          type?: string
          importance?: number
        }>
      }

      if (!Array.isArray(parsed.facts)) return []

      return parsed.facts.map(f => ({
        type: (f.type || 'entity_state') as ExtractedFact['type'],
        text: f.fact,
        entityNames: f.entity_name ? [f.entity_name] : [],
        importance: f.importance ?? 0.5,
      }))
    } catch (err) {
      logger.warn('[memory-consolidator] extractFacts Haiku call failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  /**
   * Detect contradictions between new facts and existing semantic_memories.
   * Only checks financial, commitment, and entity_state facts.
   */
  async detectContradictions(
    orgId: string,
    newFacts: ExtractedFact[],
    entityIds: string[],
  ): Promise<Contradiction[]> {
    if (entityIds.length === 0) return []

    // Load existing active memories for overlapping entities
    const { data: existing } = await this.supabase
      .from('semantic_memories')
      .select('id, content, confidence, category')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .overlaps('entity_ids', entityIds)

    if (!existing || existing.length === 0) return []

    const contradictions: Contradiction[] = []
    const contradictableTypes = new Set(['financial', 'commitment', 'entity_state'])

    for (const newFact of newFacts) {
      if (!contradictableTypes.has(newFact.type)) continue

      // Find existing facts about same entities and category
      const relatedExisting = existing.filter(m =>
        m.category === newFact.type &&
        newFact.entityNames.some(name =>
          m.content.toLowerCase().includes(name.toLowerCase()),
        ),
      )

      for (const ex of relatedExisting) {
        const isContradiction = await this.checkContradiction(ex.content, newFact.text)
        if (isContradiction) {
          contradictions.push({
            existingFact: ex.content,
            existingFactId: ex.id,
            newFact: newFact.text,
            entityId: entityIds[0],
            resolution: newFact.importance > (ex.confidence ?? 0)
              ? 'new_supersedes'
              : 'needs_review',
          })
        }
      }
    }

    return contradictions
  }

  /**
   * Use Haiku for semantic contradiction check between two facts.
   */
  private async checkContradiction(
    existingFact: string,
    newFact: string,
  ): Promise<boolean> {
    try {
      const prompt = CONTRADICTION_CHECK_PROMPT
        .replace('{EXISTING_FACT}', existingFact)
        .replace('{NEW_FACT}', newFact)

      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return false

      return textBlock.text.trim().toLowerCase().startsWith('yes')
    } catch {
      return false // fail open — don't block on contradiction check errors
    }
  }

  /**
   * Write extracted facts and resolve contradictions in the Context Baseplate.
   */
  async consolidateToBaseplate(
    orgId: string,
    extraction: ExtractionResult,
  ): Promise<void> {
    // Resolve contradictions: deactivate superseded memories
    for (const c of extraction.contradictions) {
      if (c.resolution === 'new_supersedes') {
        await this.supabase
          .from('semantic_memories')
          .update({
            is_active: false,
            superseded_by: 'conversation_extraction',
          })
          .eq('id', c.existingFactId)
          .eq('org_id', orgId)

        logger.info('[memory-consolidator] Superseded memory', {
          existingFactId: c.existingFactId,
          newFact: c.newFact,
        })
      }
    }

    // Write new facts to semantic_memories
    for (const fact of extraction.facts) {
      // Resolve entity IDs from names
      const entityIds = extraction.entities
        .filter(e => e.entityId && fact.entityNames.some(
          name => name.toLowerCase() === e.entityName.toLowerCase(),
        ))
        .map(e => e.entityId!)

      await this.supabase.from('semantic_memories').insert({
        org_id: orgId,
        content: fact.text,
        category: fact.type,
        confidence: fact.importance,
        entity_ids: entityIds,
        source: 'conversation_extraction',
        is_active: true,
      })

      // Invalidate xref cache for affected entities
      for (const entityId of entityIds) {
        invalidateCrossRefs(this.supabase, orgId, 'contact', entityId)
          .catch(() => {}) // fire-and-forget

        // Trigger profile recomputation for high-importance facts
        if (fact.importance > 0.7) {
          computeEntityProfile(this.supabase, {
            orgId,
            entityType: 'contact',
            entityId,
          }).catch(() => {}) // fire-and-forget
        }
      }
    }
  }

  /**
   * Load contacts formatted for entity mention scanning.
   */
  private async loadScanContacts(orgId: string): Promise<ScanContact[]> {
    const { data, error } = await this.supabase
      .from('contacts')
      .select('id, name, emails, phones, aliases')
      .eq('org_id', orgId)

    if (error || !data) return []

    return data.map(c => ({
      id: c.id,
      name: c.name,
      emails: c.emails ?? [],
      phones: c.phones ?? [],
      aliases: c.aliases ?? [],
    }))
  }
}
