/**
 * Memory Palace Extraction Bridge — Connects the existing MemoryConsolidator
 * pipeline to the new Memory Palace storage layer.
 *
 * When the MemoryConsolidator extracts facts from conversations, this bridge
 * stores them as typed Memory Palace entries with proper categorization,
 * entity linking, and provenance tracking.
 *
 * This is the integration layer between the old semantic_memories world
 * and the new memory_palace_entries system.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { MemoryWriter } from './memory-writer'
import type { MemoryCategory, MemorySource } from './types'

// ─── Type Mapping ────────────────────────────────────────────────────────────

/**
 * Map the MemoryConsolidator's fact types to Memory Palace categories.
 */
const FACT_TYPE_TO_CATEGORY: Record<string, MemoryCategory> = {
  financial: 'pricing',
  commitment: 'convention',
  decision: 'decision',
  entity_state: 'fact',
  action_item: 'fact',
  deadline: 'fact',
  preference: 'convention',
  relationship: 'relationship',
  contact: 'relationship',
  workflow: 'convention',
  pattern: 'pattern',
  domain: 'fact',
}

// ─── Extraction Bridge ──────────────────────────────────────────────────────

export interface ExtractedFactInput {
  type: string            // from MemoryConsolidator: financial, commitment, etc.
  text: string
  entityNames: string[]
  importance: number
}

export interface ExtractionBridgeResult {
  stored: number
  corroborated: number
  rejected: number
}

export class ExtractionBridge {
  private writer: MemoryWriter

  constructor(private supabase: SupabaseClient) {
    this.writer = new MemoryWriter(supabase)
  }

  /**
   * Bridge extracted facts into the Memory Palace.
   * Called after MemoryConsolidator.processNewTurn() extracts facts.
   */
  async bridgeFacts(
    orgId: string,
    facts: ExtractedFactInput[],
    resolvedEntities: { entityId: string; entityName: string }[],
    context: {
      threadId?: string
      turnNumber?: number
      channel?: string
    },
  ): Promise<ExtractionBridgeResult> {
    const result: ExtractionBridgeResult = {
      stored: 0,
      corroborated: 0,
      rejected: 0,
    }

    for (const fact of facts) {
      const category = FACT_TYPE_TO_CATEGORY[fact.type] ?? 'fact'

      // Resolve entity IDs from names
      const matchedEntities = resolvedEntities.filter(e =>
        fact.entityNames.some(name =>
          name.toLowerCase() === e.entityName.toLowerCase(),
        ),
      )

      const entityIds = matchedEntities.map(e => e.entityId)
      const entityNames = matchedEntities.map(e => e.entityName)

      const stored = await this.writer.storeMemory({
        orgId,
        category,
        content: fact.text,
        confidence: fact.importance,
        entityIds,
        entityNames,
        source: 'conversation_extraction' as MemorySource,
        sourceThreadId: context.threadId,
        sourceTurnNumber: context.turnNumber,
        sourceChannel: context.channel,
        tags: [fact.type],
      })

      if (stored) {
        result.stored++
      } else {
        // storeMemory returns null when corroborated
        result.corroborated++
      }
    }

    logger.debug('[extraction-bridge] Bridged facts to Memory Palace', {
      orgId,
      total: facts.length,
      ...result,
    })

    return result
  }

  /**
   * Bridge a decision extraction into the Memory Palace decision log.
   */
  async bridgeDecision(
    orgId: string,
    decision: {
      title: string
      decision: string
      reasoning: string
      entityNames: string[]
    },
    resolvedEntities: { entityId: string; entityName: string }[],
    context: {
      threadId?: string
      decidedBy?: string
    },
  ): Promise<string | null> {
    const matchedEntities = resolvedEntities.filter(e =>
      decision.entityNames.some(name =>
        name.toLowerCase() === e.entityName.toLowerCase(),
      ),
    )

    const result = await this.writer.storeDecision({
      orgId,
      title: decision.title,
      decision: decision.decision,
      reasoning: decision.reasoning,
      entityIds: matchedEntities.map(e => e.entityId),
      entityNames: matchedEntities.map(e => e.entityName),
      sourceThreadId: context.threadId,
      decidedBy: context.decidedBy,
    })

    return result?.id ?? null
  }
}
