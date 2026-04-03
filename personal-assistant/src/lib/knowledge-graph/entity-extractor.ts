import type { SupabaseClient } from '@supabase/supabase-js'
import { generateObject } from 'ai'
import { z } from 'zod'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import { findOrCreateEntity, createEdge, createEventTuple } from './graph-queries'
import type { EntityNode } from './types'

// ─── Types ───────────────────────────────────────────────────────────────

export interface ExtractionMetadata {
  sender?: string
  channel?: string
  timestamp?: string
}

export interface ExtractionResult {
  entities: number
  edges: number
  events: number
}

// ─── Schema for structured LLM output ────────────────────────────────────

const ENTITY_TYPES = ['person', 'project', 'company', 'invoice', 'channel'] as const

const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().describe('Proper name or short label for the entity'),
      type: z.enum(ENTITY_TYPES).describe('The type of entity'),
      aliases: z.array(z.string()).optional().describe('Alternative names or abbreviations'),
    })
  ),
  relationships: z.array(
    z.object({
      source_name: z.string().describe('Name of the source entity (must match an entity name above)'),
      target_name: z.string().describe('Name of the target entity (must match an entity name above)'),
      relation_type: z.string().describe('Type of relationship, e.g. owns, works_on, employed_by, blocked_by'),
    })
  ),
  events: z.array(
    z.object({
      subject_name: z.string().describe('Name of the entity performing the action (must match an entity name above)'),
      verb: z.string().describe('The action verb in snake_case, e.g. agreed_to, sent_email, blocked_by'),
      object_text: z.string().describe('What the action was performed on, as free text'),
    })
  ),
})

// ─── Prompt ──────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a knowledge graph extraction engine. Given a message, extract structured data.

Rules:
- Only extract entities that are clearly identifiable (proper nouns, specific projects, companies).
- Do NOT extract generic greetings, pronouns, or vague references.
- If the message is trivial, casual, or contains no identifiable entities, return empty arrays for all fields.
- Entity names should be capitalised properly (e.g. "Steve", "Phase 2", "Maya").
- Relationship types should be lowercase snake_case (e.g. "owns", "works_on", "blocked_by").
- Event verbs should be lowercase snake_case (e.g. "agreed_to", "sent_email").
- Each entity in relationships and events MUST match a name in the entities array.
- Be conservative: only extract what is clearly stated, not implied.

Examples of trivial messages that should return empty arrays:
- "Hey how's it going"
- "Thanks!"
- "OK sounds good"
- "lol"

Message to extract from:`

// ─── Main function ───────────────────────────────────────────────────────

/**
 * Extract entities, relationships, and events from text and populate the knowledge graph.
 * Never throws — returns zeros on any failure.
 */
export async function extractAndPopulateGraph(
  supabase: SupabaseClient,
  orgId: string,
  text: string,
  metadata: ExtractionMetadata
): Promise<ExtractionResult> {
  const result: ExtractionResult = { entities: 0, edges: 0, events: 0 }

  try {
    // Guard: invalid or trivial input
    if (!text || typeof text !== 'string' || text.trim().length < 3) {
      return result
    }

    // Step 1: Call Haiku to extract structured data
    const { object: extraction } = await generateObject({
      model: models.fast,
      schema: ExtractionSchema,
      prompt: `${EXTRACTION_PROMPT}\n\n"${text}"`,
    })

    // If nothing was extracted, return zeros
    if (
      extraction.entities.length === 0 &&
      extraction.relationships.length === 0 &&
      extraction.events.length === 0
    ) {
      return result
    }

    // Step 2: Resolve entities via findOrCreateEntity
    const entityMap = new Map<string, EntityNode>()

    for (const entity of extraction.entities) {
      const node = await findOrCreateEntity(
        supabase,
        orgId,
        entity.name,
        entity.type,
        entity.aliases
      )
      if (node) {
        entityMap.set(entity.name.toLowerCase(), node)
        result.entities++
      }
    }

    // Step 3: Create edges for relationships
    for (const rel of extraction.relationships) {
      const source = entityMap.get(rel.source_name.toLowerCase())
      const target = entityMap.get(rel.target_name.toLowerCase())
      if (source && target) {
        const edge = await createEdge(
          supabase,
          orgId,
          source.id,
          target.id,
          rel.relation_type
        )
        if (edge) result.edges++
      }
    }

    // Step 4: Create event tuples
    const occurredAt = metadata.timestamp || new Date().toISOString()

    for (const event of extraction.events) {
      const subject = entityMap.get(event.subject_name.toLowerCase())
      if (subject) {
        const tuple = await createEventTuple(
          supabase,
          orgId,
          subject.id,
          event.verb,
          event.object_text,
          occurredAt
        )
        if (tuple) result.events++
      }
    }

    return result
  } catch (err) {
    logger.error('extractAndPopulateGraph: unexpected error', { err, text: text?.slice(0, 100) })
    return result
  }
}
