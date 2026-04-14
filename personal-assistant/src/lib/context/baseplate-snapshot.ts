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
  /** Rich LLM-compiled dossier markdown (present when source='dossier'). */
  dossierMarkdown?: string
  /** Which data source produced this snapshot. */
  source: 'dossier' | 'profile'
  computedAt: string
  validUntil: string
  eventCount: number
  stale: boolean
}

export async function getBaseplateSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  entityName?: string,
): Promise<BaseplateSnapshot | null> {
  // ── Primary source: entity_dossiers (Living Brain pipeline) ───────────
  if (entityName) {
    const dossierResult = await tryDossierSource(supabase, orgId, entityName)
    if (dossierResult) return dossierResult
  }

  // ── Fallback: entity_profiles (legacy baseplate) ──────────────────────
  return tryProfileSource(supabase, orgId, entityType, entityId)
}

// ─── Dossier source ────────────────────────────────────────────────────────

async function tryDossierSource(
  supabase: SupabaseClient,
  orgId: string,
  entityName: string,
): Promise<BaseplateSnapshot | null> {
  const { data, error } = await supabase
    .from('entity_dossiers')
    .select('entity_id, entity_name, dossier_markdown, last_compiled_at, token_count, version')
    .eq('org_id', orgId)
    .ilike('entity_name', entityName)
    .order('last_compiled_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data || !data.dossier_markdown) {
    logger.debug('[baseplate-snapshot] No usable dossier found, will try profile fallback', {
      entityName,
      hasData: !!data,
      hasMarkdown: !!data?.dossier_markdown,
    })
    return null
  }

  logger.debug('[baseplate-snapshot] Source: dossier', {
    entityName: data.entity_name,
    version: data.version,
    tokenCount: data.token_count,
  })

  // Build a minimal profile from dossier metadata (the markdown is the rich source)
  const emptyProfile: BaseplateSnapshot['profile'] = {
    recent_events: [],
    relationships: [],
    memories: [],
    event_summary: { total: 0, channels: [], last_event_at: null },
  }

  return {
    profile: emptyProfile,
    dossierMarkdown: data.dossier_markdown,
    source: 'dossier',
    computedAt: data.last_compiled_at,
    validUntil: data.last_compiled_at, // Dossiers don't expire the same way
    eventCount: 0,
    stale: false,
  }
}

// ─── Profile source (legacy) ───────────────────────────────────────────────

async function tryProfileSource(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
): Promise<BaseplateSnapshot | null> {
  const { data, error } = await supabase
    .from('entity_profiles')
    .select('profile_data, computed_at, valid_until, event_count_at_compute')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (error || !data) return null

  logger.debug('[baseplate-snapshot] Source: profile (fallback)', {
    entityType,
    entityId,
  })

  const profile = { ...data.profile_data } as BaseplateSnapshot['profile']

  // Enrich profile with knowledge graph relationships (persisted in Supabase)
  try {
    const graph = getKnowledgeGraph(supabase, orgId)

    const relationships = await graph.getRelationships(entityId, 2)
    const topics = await graph.getTopicsForEntity(entityId)

    const relatedPeople = relationships
      .filter(rel => rel.type === 'Person')
      .map(rel => ({
        id: rel.id,
        name: rel.name,
        connection_type: rel.relationshipType,
        communication_frequency: undefined,
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
    logger.debug('[baseplate-snapshot] Graph enrichment failed (non-critical):', {
      error: graphErr instanceof Error ? graphErr.message : String(graphErr),
    })
  }

  return {
    profile,
    source: 'profile',
    computedAt: data.computed_at,
    validUntil: data.valid_until,
    eventCount: data.event_count_at_compute,
    stale: new Date() > new Date(data.valid_until),
  }
}
