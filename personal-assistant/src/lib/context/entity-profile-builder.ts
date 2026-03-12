import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

interface ProfileInput {
  orgId: string
  entityType: string
  entityId: string
}

export async function computeEntityProfile(
  supabase: SupabaseClient,
  input: ProfileInput
): Promise<void> {
  const { orgId, entityType, entityId } = input

  // Staleness check: skip if no new events since last computation
  const { data: existing } = await supabase
    .from('entity_profiles')
    .select('event_count_at_compute')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  const { count: currentEventCount } = await supabase
    .from('entity_timeline')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('entity_id', entityId)

  if (existing && currentEventCount !== null && existing.event_count_at_compute >= currentEventCount) {
    logger.debug('[entity-profile-builder] Skipping recomputation — no new events', { entityType, entityId })
    return
  }

  // Fetch recent timeline events (last 50)
  const { data: events, count: eventCount } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, channel_source, created_at', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch relationships
  const { data: relationships } = await supabase
    .from('entity_relationships')
    .select('entity_a_type, entity_a_id, entity_b_type, entity_b_id, relationship_type, strength')
    .or(`and(entity_a_id.eq.${entityId},entity_a_type.eq.${entityType}),and(entity_b_id.eq.${entityId},entity_b_type.eq.${entityType})`)

  // Fetch active memories
  const { data: memories } = await supabase
    .from('semantic_memories')
    .select('content, confidence, category, created_at')
    .contains('entity_ids', [entityId])
    .eq('is_active', true)

  const profileData = {
    recent_events: (events ?? []).slice(0, 20).map(e => ({
      type: e.event_type,
      data: e.event_data,
      channel: e.channel_source,
      at: e.created_at,
    })),
    relationships: (relationships ?? []).map(r => ({
      type: r.relationship_type,
      target_type: r.entity_a_id === entityId ? r.entity_b_type : r.entity_a_type,
      target_id: r.entity_a_id === entityId ? r.entity_b_id : r.entity_a_id,
      strength: r.strength,
    })),
    memories: (memories ?? []).map(m => ({
      fact: m.content,
      confidence: m.confidence,
      category: m.category,
    })),
    event_summary: {
      total: eventCount ?? 0,
      channels: [...new Set((events ?? []).map(e => e.channel_source).filter(Boolean))],
      last_event_at: events?.[0]?.created_at ?? null,
    },
  }

  const { error } = await supabase.from('entity_profiles').upsert(
    {
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      profile_data: profileData,
      computed_from_events: (events ?? []).length,
      event_count_at_compute: eventCount ?? 0,
      computed_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,entity_type,entity_id' }
  )

  if (error) {
    logger.error('Failed to compute entity profile', { err: error, entityType, entityId })
  }
}
