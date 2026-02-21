import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked } from './entity-resolver'
import type {
  EntityType,
  EntityBriefing,
  ContextBriefing,
  RelationshipEdge,
  TimelineEntry,
  MemoryEntry,
  ResolvedEntity,
} from './types'

/**
 * Assemble a full briefing for a single entity: relationships, timeline, and memories.
 */
export async function assembleEntityBriefing(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  options?: { maxTimelineEvents?: number; maxMemories?: number }
): Promise<EntityBriefing> {
  const maxTimeline = options?.maxTimelineEvents ?? 15
  const maxMemories = options?.maxMemories ?? 10

  const [relRes, timelineRes, memoriesRes] = await Promise.all([
    supabase
      .from('entity_relationships')
      .select('*')
      .eq('org_id', orgId)
      .or(
        `and(entity_a_type.eq.${entityType},entity_a_id.eq.${entityId}),and(entity_b_type.eq.${entityType},entity_b_id.eq.${entityId})`
      )
      .order('strength', { ascending: false })
      .limit(20),
    supabase
      .from('entity_timeline')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false })
      .limit(maxTimeline),
    supabase
      .from('semantic_memories')
      .select('*')
      .eq('org_id', orgId)
      .contains('entity_ids', [entityId])
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .limit(maxMemories),
  ])

  const relationships: RelationshipEdge[] = (relRes.data ?? []).map((r: Record<string, unknown>) => {
    // Return the "other" side of the relationship
    const isA = r.entity_a_type === entityType && r.entity_a_id === entityId
    return {
      entityType: (isA ? r.entity_b_type : r.entity_a_type) as EntityType,
      entityId: (isA ? r.entity_b_id : r.entity_a_id) as string,
      relationshipType: r.relationship_type as RelationshipEdge['relationshipType'],
      strength: r.strength as number,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      lastEvidenceAt: r.last_evidence_at as string,
    }
  })

  const timeline: TimelineEntry[] = (timelineRes.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    eventType: t.event_type as TimelineEntry['eventType'],
    eventData: (t.event_data ?? {}) as Record<string, unknown>,
    occurredAt: t.occurred_at as string,
    channelSource: (t.channel_source ?? null) as string | null,
  }))

  const memories: MemoryEntry[] = (memoriesRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    category: m.category as string,
    content: m.content as string,
    confidence: m.confidence as number,
    entityIds: (m.entity_ids ?? []) as string[],
  }))

  return {
    entity: { type: entityType, id: entityId },
    relationships,
    timeline,
    memories,
  }
}

/**
 * Format an entity briefing into a plain-text summary, budgeted to ~2000 chars.
 */
function formatBriefingSummary(briefing: EntityBriefing, entityName: string): string {
  const lines: string[] = []
  lines.push(`**${entityName}** (${briefing.entity.type})`)

  if (briefing.relationships.length > 0) {
    lines.push('Relationships:')
    for (const rel of briefing.relationships.slice(0, 5)) {
      lines.push(`  - ${rel.relationshipType} -> ${rel.entityType}:${rel.entityId.slice(0, 8)}`)
    }
  }

  if (briefing.timeline.length > 0) {
    lines.push('Recent events:')
    for (const ev of briefing.timeline.slice(0, 5)) {
      const date = new Date(ev.occurredAt).toLocaleDateString('en-AU')
      lines.push(`  - ${date}: ${ev.eventType}`)
    }
  }

  if (briefing.memories.length > 0) {
    lines.push('Memories:')
    for (const mem of briefing.memories.slice(0, 3)) {
      lines.push(`  - ${mem.content.slice(0, 100)}`)
    }
  }

  const result = lines.join('\n')
  return result.length > 2000 ? result.slice(0, 1997) + '...' : result
}

/**
 * Assemble context for a user query: resolve entities and build briefings.
 */
export async function assembleContext(
  supabase: SupabaseClient,
  orgId: string,
  query: string
): Promise<ContextBriefing> {
  const empty: ContextBriefing = { resolvedEntities: [], briefings: [], summary: '' }

  // Extract potential entity mentions (words with 2+ chars, skip common words)
  const words = query.split(/\s+/).filter(w => w.length >= 2)
  const stopWords = new Set(['the', 'for', 'and', 'with', 'about', 'what', 'how', 'can', 'you', 'please', 'tell', 'show', 'get', 'find'])

  const candidates = words.filter(w => !stopWords.has(w.toLowerCase()))
  if (candidates.length === 0) return empty

  // Try resolving each candidate, collect unique matches
  const resolvedEntities: ResolvedEntity[] = []
  const seenIds = new Set<string>()

  for (const candidate of candidates) {
    if (resolvedEntities.length >= 3) break
    const ranked = await resolveEntityRanked(supabase, candidate, orgId)
    for (const match of ranked) {
      if (!seenIds.has(match.contact.id)) {
        seenIds.add(match.contact.id)
        resolvedEntities.push({
          type: 'contact',
          id: match.contact.id,
          name: match.contact.name,
          matchConfidence: match.matchConfidence,
          matchStep: match.matchStep,
        })
      }
    }
  }

  if (resolvedEntities.length === 0) return empty

  // Build briefings for each resolved entity
  const briefings: EntityBriefing[] = await Promise.all(
    resolvedEntities.slice(0, 3).map(e =>
      assembleEntityBriefing(supabase, orgId, e.type, e.id)
    )
  )

  // Build summary text
  const summaryParts = resolvedEntities.slice(0, 3).map((entity, i) =>
    formatBriefingSummary(briefings[i], entity.name)
  )
  const summary = summaryParts.join('\n\n')

  return { resolvedEntities, briefings, summary }
}
