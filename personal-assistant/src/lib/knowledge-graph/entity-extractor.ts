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

// ─── Constants ───────────────────────────────────────────────────────────

const EMPTY_RESULT: ExtractionResult = Object.freeze({ entities: 0, edges: 0, events: 0 })

/** Minimum text length to attempt extraction (skip "ok", "hi", etc.) */
const MIN_TEXT_LENGTH = 3

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

type Extraction = z.infer<typeof ExtractionSchema>

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

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Resolve all extracted entities to DB nodes, returning a name->node map. */
async function resolveEntities(
  supabase: SupabaseClient,
  orgId: string,
  entities: Extraction['entities']
): Promise<{ map: Map<string, EntityNode>; count: number }> {
  const map = new Map<string, EntityNode>()
  let count = 0

  for (const entity of entities) {
    const node = await findOrCreateEntity(supabase, orgId, entity.name, entity.type, entity.aliases)
    if (node) {
      map.set(entity.name.toLowerCase(), node)
      count++
    }
  }

  return { map, count }
}

/** Create edges for extracted relationships, looking up nodes from the entity map. */
async function persistEdges(
  supabase: SupabaseClient,
  orgId: string,
  relationships: Extraction['relationships'],
  entityMap: Map<string, EntityNode>
): Promise<number> {
  let count = 0
  for (const rel of relationships) {
    const source = entityMap.get(rel.source_name.toLowerCase())
    const target = entityMap.get(rel.target_name.toLowerCase())
    if (source && target) {
      const edge = await createEdge(supabase, orgId, source.id, target.id, rel.relation_type)
      if (edge) count++
    }
  }
  return count
}

/** Create event tuples for extracted events. */
async function persistEvents(
  supabase: SupabaseClient,
  orgId: string,
  events: Extraction['events'],
  entityMap: Map<string, EntityNode>,
  occurredAt: string
): Promise<number> {
  let count = 0
  for (const event of events) {
    const subject = entityMap.get(event.subject_name.toLowerCase())
    if (subject) {
      const tuple = await createEventTuple(
        supabase, orgId, subject.id, event.verb, event.object_text, occurredAt
      )
      if (tuple) count++
    }
  }
  return count
}

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
  try {
    // Guard: invalid or trivial input
    if (!text || typeof text !== 'string' || text.trim().length < MIN_TEXT_LENGTH) {
      return { ...EMPTY_RESULT }
    }

    // Step 1: Call Haiku to extract structured data
    const { object: extraction } = await generateObject({
      model: models.fast,
      schema: ExtractionSchema,
      prompt: `${EXTRACTION_PROMPT}\n\n"${text}"`,
    })

    // If nothing was extracted, return early
    if (
      extraction.entities.length === 0 &&
      extraction.relationships.length === 0 &&
      extraction.events.length === 0
    ) {
      return { ...EMPTY_RESULT }
    }

    // Step 2: Resolve entities
    const { map: entityMap, count: entityCount } = await resolveEntities(
      supabase, orgId, extraction.entities
    )

    // Step 3: Persist edges
    const edgeCount = await persistEdges(
      supabase, orgId, extraction.relationships, entityMap
    )

    // Step 4: Persist events
    const occurredAt = metadata.timestamp || new Date().toISOString()
    const eventCount = await persistEvents(
      supabase, orgId, extraction.events, entityMap, occurredAt
    )

    return { entities: entityCount, edges: edgeCount, events: eventCount }
  } catch (err) {
    logger.error('extractAndPopulateGraph: unexpected error', { err, text: text?.slice(0, 100) })
    return { ...EMPTY_RESULT }
  }
}
