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

  return {
    profile: data.profile_data,
    computedAt: data.computed_at,
    validUntil: data.valid_until,
    eventCount: data.event_count_at_compute,
    stale: new Date() > new Date(data.valid_until),
  }
}
