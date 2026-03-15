import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getKnowledgeGraph } from '@/lib/rag/knowledge-graph'

export interface BaseplateSnapshot {
  profile: {
    recent_events: Array<{ type: string; data?: unknown; channel?: string; at: string }>
    relationships: Array<{ type: string; target_type: string; target_id: string; strength?: number }>
    memories: Array<{ fact: string; confidence: number; category?: string }>
    event_summary: { total: number; channels: string[]; last_event_at: string | null }
    relationship_context?: {
      related_people: Array<{ id: string; name: string; connection_type: string; communication_frequency?: string }>
      topics: Array<{ id: string; name: string; first_seen: string; last_seen: string }>
      graph_distance: number
    }
  }
  computedAt: string
  validUntil: string
  eventCount: number
  stale: boolean
}

export async function getBaseplateSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string
): Promise<BaseplateSnapshot | null> {
  const { data, error } = await supabase
    .from('entity_profiles')
    .select('profile_data, computed_at, valid_until, event_count_at_compute')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (error || !data) return null

  const profile = { ...data.profile_data } as BaseplateSnapshot['profile']

  // Enrich profile with knowledge graph relationships
  try {
    const graph = await getKnowledgeGraph()

    // Get relationships for this entity
    const relationships = await graph.getRelationships(entityId, 2)

    // Get topics associated with this entity
    const topics = await graph.getTopicsForEntity(entityId)

    // Filter relationships to get related people
    const relatedPeople = relationships
      .filter(rel => rel.type === 'Person')
      .map(rel => ({
        id: rel.id,
        name: rel.name,
        connection_type: rel.relationshipType,
        communication_frequency: undefined, // Could be extracted from edge data if available
      }))

    if (relatedPeople.length > 0 || topics.length > 0) {
      profile.relationship_context = {
        related_people: relatedPeople,
        topics: topics.map(t => ({
          id: t.id,
          name: t.name,
          first_seen: t.first_seen,
          last_seen: t.last_seen,
        })),
        graph_distance: Math.max(
          ...relationships.map(r => r.distance),
          0
        ),
      }
    }
  } catch (graphErr) {
    // Graph unavailability should not break baseplate
    // Log but continue with base profile
    logger.debug('[baseplate-snapshot] Graph enrichment failed (non-critical):', {
      error: graphErr instanceof Error ? graphErr.message : String(graphErr),
    })
  }

  return {
    profile,
    computedAt: data.computed_at,
    validUntil: data.valid_until,
    eventCount: data.event_count_at_compute,
    stale: new Date() > new Date(data.valid_until),
  }
}
