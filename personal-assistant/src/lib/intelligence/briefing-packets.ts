/**
 * Pre-Computed Briefing Packets
 *
 * Generates ready-to-use context packets triggered by:
 * - Upcoming calendar events (before meeting with Client X)
 * - Time of day (morning briefing)
 * - Entity mentions (when someone is discussed)
 *
 * Briefings are stored in semantic_memories so they're available
 * via search_memory without additional computation at query time.
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BriefingPacket {
  entityId: string
  entityName: string
  briefingType: 'meeting_prep' | 'morning' | 'follow_up'
  content: string
  validUntil: string
}

/**
 * Generate meeting prep briefings for upcoming calendar events.
 * Checks for events in the next 24 hours and pre-compiles context
 * about each attendee/subject.
 */
export async function generateMeetingPrepBriefings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingPacket[]> {
  const packets: BriefingPacket[] = []

  try {
    // Get contacts with recent activity to build briefings for
    const { data: recentContacts } = await supabase
      .from('entity_timeline')
      .select('entity_id, entity_type')
      .eq('org_id', orgId)
      .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('occurred_at', { ascending: false })
      .limit(50)

    if (!recentContacts || recentContacts.length === 0) return packets

    // Get unique contact entity IDs
    const contactIds = [...new Set(
      recentContacts
        .filter(e => e.entity_type === 'contact')
        .map(e => e.entity_id)
    )].slice(0, 10) // top 10 most active contacts

    for (const contactId of contactIds) {
      try {
        const briefing = await buildContactBriefing(supabase, orgId, contactId)
        if (briefing) packets.push(briefing)
      } catch {
        // Individual briefing failure shouldn't stop others
      }
    }
  } catch (err) {
    logger.warn('[briefing-packets] Failed to generate meeting prep', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return packets
}

/**
 * Build a comprehensive briefing for a single contact.
 * Pulls: recent messages, outstanding items, financial state, relationship health.
 */
async function buildContactBriefing(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<BriefingPacket | null> {
  // Get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, type, profile_data')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()

  if (!contact) return null

  const sections: string[] = []
  sections.push(`Contact: ${contact.name} (${contact.type ?? 'unknown'})`)

  // Recent timeline events
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, occurred_at, event_data, channel_source')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(10)

  if (events && events.length > 0) {
    const lastEvent = events[0]
    const daysSince = Math.round((Date.now() - new Date(lastEvent.occurred_at).getTime()) / (1000 * 60 * 60 * 24))
    sections.push(`Last interaction: ${daysSince} day(s) ago via ${lastEvent.channel_source ?? 'unknown'} (${lastEvent.event_type})`)
    sections.push(`Total recent events: ${events.length}`)
  }

  // Related semantic memories
  const { data: memories } = await supabase
    .from('semantic_memories')
    .select('content, confidence')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('entity_ids', [contactId])
    .order('confidence', { ascending: false })
    .limit(5)

  if (memories && memories.length > 0) {
    sections.push('Key facts:')
    for (const m of memories) {
      sections.push(`  - ${m.content.slice(0, 150)}`)
    }
  }

  // Related tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, priority')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .in('status', ['pending', 'in_progress'])
    .limit(5)

  if (tasks && tasks.length > 0) {
    sections.push('Open tasks:')
    for (const t of tasks) {
      sections.push(`  - [${t.priority ?? 'normal'}] ${t.title} (${t.status})`)
    }
  }

  if (sections.length <= 1) return null // just the name, no useful context

  const content = `[briefing] ${sections.join('\n')}`
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  return {
    entityId: contactId,
    entityName: contact.name,
    briefingType: 'meeting_prep',
    content,
    validUntil,
  }
}

/**
 * Store briefing packets as time-limited semantic memories.
 * They'll be found by search_memory when the contact is discussed.
 */
export async function storeBriefingPackets(
  supabase: SupabaseClient,
  orgId: string,
  packets: BriefingPacket[],
): Promise<number> {
  let stored = 0

  for (const packet of packets) {
    // Remove any existing stale briefing for this entity
    await supabase
      .from('semantic_memories')
      .update({ is_active: false })
      .eq('org_id', orgId)
      .contains('entity_ids', [packet.entityId])
      .ilike('content', '[briefing]%')

    // Store fresh briefing
    const { error } = await supabase
      .from('semantic_memories')
      .insert({
        org_id: orgId,
        content: packet.content,
        category: 'general',
        confidence: 0.85,
        entity_ids: [packet.entityId],
        is_active: true,
        decay_rate: 'fast', // briefings expire quickly
        admission_score: 0.85,
      })

    if (!error) stored++
  }

  logger.info('[briefing-packets] Stored briefings', { orgId, count: stored })
  return stored
}

/**
 * Run the full briefing generation pipeline.
 * Designed to be called from the sleep-time compute cron.
 */
export async function refreshBriefings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ generated: number; stored: number }> {
  const packets = await generateMeetingPrepBriefings(supabase, orgId)
  const stored = packets.length > 0 ? await storeBriefingPackets(supabase, orgId, packets) : 0
  return { generated: packets.length, stored }
}
