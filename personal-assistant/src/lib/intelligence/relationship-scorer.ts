import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RelationshipTrend = 'rising' | 'stable' | 'declining' | 'cold'

export interface RelationshipScore {
  strength: number // 0-100
  trend: RelationshipTrend
  lastInteraction: Date | null
  topChannel: string
  daysSinceContact: number
}

export interface ColdRelationship {
  contactId: string
  contactName: string
  currentStrength: number
  peakStrength: number
  daysSinceContact: number
  context: string // Human-readable nudge text
  importance: number // 0-1, used for confidence on approvals
}

// ---------------------------------------------------------------------------
// Weight constants
// ---------------------------------------------------------------------------

/** Decay rate: points lost per day of inactivity */
const DECAY_PER_DAY = 2

/** Time windows and their weights for message scoring */
const MESSAGE_WINDOWS = [
  { days: 30, weight: 3 },
  { days: 60, weight: 2 },
  { days: 90, weight: 1 },
] as const

/** Maximum points from each scoring dimension */
const MAX_MESSAGE_SCORE = 40
const MAX_RECIPROCITY_SCORE = 15
const MAX_MEETING_SCORE = 15
const MAX_REVENUE_SCORE = 20
const MAX_PROJECT_SCORE = 10

// ---------------------------------------------------------------------------
// computeRelationshipStrength
// ---------------------------------------------------------------------------

export async function computeRelationshipStrength(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<RelationshipScore> {
  const now = new Date()

  // Fetch timeline events for this contact (last 90 days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, channel_source, occurred_at')
    .eq('org_id', orgId)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .gte('occurred_at', ninetyDaysAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(200)

  // Fetch invoices for this contact
  const { data: invoices } = await supabase
    .from('invoices')
    .select('status, total, paid_date, due_date, created_at')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .limit(50)

  // Fetch tasks related to this contact via entity_relationships
  const { data: taskRelations } = await supabase
    .from('entity_relationships')
    .select('entity_a_id, entity_b_id, entity_a_type, entity_b_type, last_evidence_at')
    .eq('org_id', orgId)
    .or(
      `and(entity_a_type.eq.contact,entity_a_id.eq.${contactId}),and(entity_b_type.eq.contact,entity_b_id.eq.${contactId})`,
    )

  const timeline = events ?? []
  const allInvoices = invoices ?? []
  const relations = taskRelations ?? []

  // --- 1. Message frequency score ---
  let messageScore = 0
  const channelCounts: Record<string, number> = {}

  for (const window of MESSAGE_WINDOWS) {
    const cutoff = new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000)
    const windowEvents = timeline.filter(
      (e) =>
        (e.event_type === 'message_received' || e.event_type === 'message_sent') &&
        new Date(e.occurred_at) >= cutoff,
    )
    messageScore += windowEvents.length * window.weight

    for (const e of windowEvents) {
      const ch = e.channel_source ?? 'unknown'
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1
    }
  }
  messageScore = Math.min(messageScore, MAX_MESSAGE_SCORE)

  // --- 2. Reciprocity score ---
  const sent = timeline.filter((e) => e.event_type === 'message_sent').length
  const received = timeline.filter((e) => e.event_type === 'message_received').length
  let reciprocityScore = 0
  if (sent + received > 0) {
    const ratio = Math.min(sent, received) / Math.max(sent, received)
    reciprocityScore = Math.round(ratio * MAX_RECIPROCITY_SCORE)
  }

  // --- 3. Meeting frequency score ---
  const meetingEvents = timeline.filter(
    (e) =>
      e.event_type === 'task_created' &&
      e.event_data &&
      typeof e.event_data === 'object' &&
      (e.event_data as Record<string, unknown>).type === 'meeting',
  )
  const meetingScore = Math.min(meetingEvents.length * 5, MAX_MEETING_SCORE)

  // --- 4. Revenue relationship score ---
  let revenueScore = 0
  const activeInvoices = allInvoices.filter((i) =>
    ['sent', 'viewed', 'overdue'].includes(i.status),
  )
  const paidInvoices = allInvoices.filter((i) => i.status === 'paid')
  const totalRevenue = paidInvoices.reduce(
    (sum, i) => sum + (parseFloat(String(i.total)) || 0),
    0,
  )

  if (activeInvoices.length > 0) revenueScore += 8
  if (totalRevenue > 0) revenueScore += Math.min(Math.round(totalRevenue / 500), 8)
  if (paidInvoices.length > 0) {
    // Payment reliability bonus
    const overdueCount = allInvoices.filter((i) => i.status === 'overdue').length
    const reliabilityRatio = 1 - overdueCount / allInvoices.length
    revenueScore += Math.round(reliabilityRatio * 4)
  }
  revenueScore = Math.min(revenueScore, MAX_REVENUE_SCORE)

  // --- 5. Project activity score ---
  const taskRelCount = relations.filter(
    (r) =>
      (r.entity_a_type === 'task' && r.entity_b_type === 'contact') ||
      (r.entity_a_type === 'contact' && r.entity_b_type === 'task'),
  ).length
  const projectScore = Math.min(taskRelCount * 2, MAX_PROJECT_SCORE)

  // --- Base strength ---
  const baseStrength =
    messageScore + reciprocityScore + meetingScore + revenueScore + projectScore

  // --- Time decay ---
  const lastEvent = timeline[0]
  const lastInteraction = lastEvent ? new Date(lastEvent.occurred_at) : null
  const daysSinceContact = lastInteraction
    ? Math.floor((now.getTime() - lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
    : 999

  const decayPenalty = daysSinceContact * DECAY_PER_DAY
  const strength = Math.max(0, Math.min(100, baseStrength - decayPenalty))

  // --- Top channel ---
  const topChannel =
    Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none'

  // --- Trend ---
  const trend = computeTrend(strength, daysSinceContact)

  return {
    strength,
    trend,
    lastInteraction,
    topChannel,
    daysSinceContact,
  }
}

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

function computeTrend(strength: number, daysSinceContact: number): RelationshipTrend {
  if (daysSinceContact <= 7 && strength >= 40) return 'rising'
  if (daysSinceContact > 30 || strength < 15) return 'cold'
  if (daysSinceContact > 14 || strength < 30) return 'declining'
  return 'stable'
}

// ---------------------------------------------------------------------------
// computeAllRelationshipScores
// ---------------------------------------------------------------------------

export async function computeAllRelationshipScores(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ scored: number; errors: number }> {
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)

  if (contactsError) {
    throw new Error(`Failed to fetch contacts: ${contactsError.message}`)
  }

  let scored = 0
  let errors = 0

  for (const contact of contacts ?? []) {
    try {
      const score = await computeRelationshipStrength(supabase, orgId, contact.id)

      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          relationship_strength: score.strength,
          relationship_trend: score.trend,
          last_interaction_at: score.lastInteraction?.toISOString() ?? null,
          relationship_scored_at: new Date().toISOString(),
        })
        .eq('id', contact.id)
        .eq('org_id', orgId)

      if (updateError) {
        logger.error('[relationship-scorer] Failed to update contact', {
          contactId: contact.id,
          err: updateError.message,
        })
        errors++
      } else {
        scored++
      }
    } catch (err) {
      logger.error('[relationship-scorer] Failed to score contact', {
        contactId: contact.id,
        err: err instanceof Error ? err.message : String(err),
      })
      errors++
    }
  }

  return { scored, errors }
}

// ---------------------------------------------------------------------------
// detectColdRelationships
// ---------------------------------------------------------------------------

export async function detectColdRelationships(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ColdRelationship[]> {
  // Find contacts that were important (strength > 50 at some point implied by
  // having revenue or active projects) but now score below 30
  const { data: coldContacts } = await supabase
    .from('contacts')
    .select('id, name, relationship_strength, last_interaction_at, lifetime_value')
    .eq('org_id', orgId)
    .lt('relationship_strength', 30)
    .order('relationship_strength', { ascending: true })
    .limit(50)

  const results: ColdRelationship[] = []
  const now = new Date()

  for (const contact of coldContacts ?? []) {
    const daysSince = contact.last_interaction_at
      ? Math.floor(
          (now.getTime() - new Date(contact.last_interaction_at).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : 999

    // Check if they have active invoices or tasks
    const { data: activeInvoices } = await supabase
      .from('invoices')
      .select('id, total, status')
      .eq('org_id', orgId)
      .eq('client_contact_id', contact.id)
      .in('status', ['sent', 'viewed', 'overdue'])
      .limit(5)

    const { data: taskRels } = await supabase
      .from('entity_relationships')
      .select('entity_a_id, entity_b_id, entity_a_type, entity_b_type')
      .eq('org_id', orgId)
      .or(
        `and(entity_a_type.eq.contact,entity_a_id.eq.${contact.id}),and(entity_b_type.eq.contact,entity_b_id.eq.${contact.id})`,
      )
      .limit(10)

    const hasActiveInvoices = (activeInvoices ?? []).length > 0
    const hasTaskRelationships = (taskRels ?? []).length > 0
    const lifetimeValue = parseFloat(String(contact.lifetime_value ?? '0')) || 0

    // Only flag contacts that were once important:
    // - Had revenue OR active projects OR last_interaction_at within 90 days and now cold
    const wasImportant =
      lifetimeValue > 0 || hasActiveInvoices || hasTaskRelationships || daysSince < 90

    if (!wasImportant) continue

    // Build context message
    const contextParts: string[] = [
      `You haven't spoken to ${contact.name} in ${daysSince} days.`,
    ]
    if (hasActiveInvoices) {
      const invoiceTotal = (activeInvoices ?? []).reduce(
        (sum, i) => sum + (parseFloat(String(i.total)) || 0),
        0,
      )
      contextParts.push(
        `They have ${activeInvoices!.length} active invoice(s) totalling $${invoiceTotal.toFixed(2)}.`,
      )
    }
    if (lifetimeValue > 0) {
      contextParts.push(`Lifetime value: $${lifetimeValue.toFixed(2)}.`)
    }
    if (hasTaskRelationships) {
      contextParts.push(`They have ${taskRels!.length} linked task(s).`)
    }

    // Importance: higher for high-revenue clients
    const importance = Math.min(
      1.0,
      0.3 + (lifetimeValue > 1000 ? 0.3 : lifetimeValue / 3000) + (hasActiveInvoices ? 0.2 : 0) + (hasTaskRelationships ? 0.1 : 0),
    )

    results.push({
      contactId: contact.id,
      contactName: contact.name,
      currentStrength: contact.relationship_strength ?? 0,
      peakStrength: 50, // We don't track historical peak yet, assume 50 as min threshold
      daysSinceContact: daysSince,
      context: contextParts.join(' '),
      importance,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// generateRelationshipNudges
// ---------------------------------------------------------------------------

export async function generateRelationshipNudges(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ nudgesCreated: number }> {
  const coldRelationships = await detectColdRelationships(supabase, orgId)

  if (coldRelationships.length === 0) {
    return { nudgesCreated: 0 }
  }

  // Find the relationship-health agent config (or use a fallback sentry config)
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'client-comms')
    .single()

  if (!agentConfig) {
    logger.warn('[relationship-scorer] No client-comms agent config found for org', {
      orgId,
    })
    return { nudgesCreated: 0 }
  }

  let nudgesCreated = 0

  for (const cold of coldRelationships) {
    // Determine suggested action
    const action =
      cold.daysSinceContact > 60
        ? `Schedule a catch-up call with ${cold.contactName}`
        : `Send a check-in message to ${cold.contactName}`

    try {
      const { error } = await supabase.from('approval_queue').insert({
        org_id: orgId,
        agent_config_id: agentConfig.id,
        agent_run_id: null,
        action_type: 'relationship_nudge',
        action_payload: {
          contact_id: cold.contactId,
          contact_name: cold.contactName,
          suggested_action: action,
          days_since_contact: cold.daysSinceContact,
          current_strength: cold.currentStrength,
        },
        action_summary: action,
        confidence_score: cold.importance,
        routing_decision: 'ask',
        priority: cold.importance >= 0.7 ? 'urgent' : 'normal',
        digest_eligible: cold.importance < 0.5,
        context_snapshot: {
          relationship_context: cold.context,
          strength: cold.currentStrength,
          trend: 'cold',
        },
      })

      if (error) {
        logger.error('[relationship-scorer] Failed to create nudge', {
          contactId: cold.contactId,
          err: error.message,
        })
      } else {
        nudgesCreated++
      }
    } catch (err) {
      logger.error('[relationship-scorer] Unexpected error creating nudge', {
        contactId: cold.contactId,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { nudgesCreated }
}
