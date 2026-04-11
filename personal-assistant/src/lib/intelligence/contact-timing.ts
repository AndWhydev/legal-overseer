import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptimalContactWindow {
  dayOfWeek: number // 0=Sunday, 6=Saturday
  hourStart: number // 0-23
  hourEnd: number   // 0-23 (hourStart + 1 normally)
  avgResponseMinutes: number
  sampleSize: number
}

export interface ContactTimingResult {
  contactId: string
  windows: OptimalContactWindow[]
  totalEvents: number
  analyzedAt: string
}

export interface BatchTimingResult {
  processed: number
  skipped: number
  errors: number
  results: ContactTimingResult[]
}

interface TimelineEvent {
  id: string
  event_type: string
  event_data: Record<string, unknown>
  channel_source: string | null
  occurred_at: string
  related_entity_id: string | null
}

interface TimeBucket {
  dayOfWeek: number
  hour: number
  responseTimes: number[] // minutes
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum data points per window to be considered confident. */
const MIN_SAMPLE_SIZE = 5

/** Minimum total timeline events a contact must have to be analyzed. */
const MIN_EVENTS_FOR_ANALYSIS = 10

/** Maximum events to scan per contact. */
const MAX_EVENTS_SCAN = 500

/** Maximum response latency to consider valid (24 hours). */
const MAX_RESPONSE_LATENCY_MS = 24 * 60 * 60 * 1000

/** AEST offset from UTC in hours. */
const AEST_OFFSET_HOURS = 10

// ─── Core Analyzer ───────────────────────────────────────────────────────────

/**
 * Analyze a contact's communication patterns to find optimal send windows.
 *
 * Scans entity_timeline for message_sent/message_received events,
 * pairs outbound→inbound to measure response latency per time bucket,
 * and returns windows sorted by fastest average response time.
 */
export async function analyzeContactTiming(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<ContactTimingResult> {
  const now = new Date()

  // Fetch timeline events for this contact (sent and received messages)
  const { data: events, error } = await supabase
    .from('entity_timeline')
    .select('id, event_type, event_data, channel_source, occurred_at, related_entity_id')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .in('event_type', ['message_sent', 'message_received'])
    .order('occurred_at', { ascending: true })
    .limit(MAX_EVENTS_SCAN)

  if (error) {
    logger.error('[contact-timing] Failed to fetch timeline events', {
      err: error.message,
      contactId,
    })
    return { contactId, windows: [], totalEvents: 0, analyzedAt: now.toISOString() }
  }

  const timelineEvents = (events ?? []) as TimelineEvent[]

  if (timelineEvents.length < MIN_EVENTS_FOR_ANALYSIS) {
    return {
      contactId,
      windows: [],
      totalEvents: timelineEvents.length,
      analyzedAt: now.toISOString(),
    }
  }

  // Build response latency pairs:
  // For each message_sent, find the next message_received from the same contact
  const buckets = computeResponseBuckets(timelineEvents)

  // Convert buckets to windows, filtering by minimum sample size
  const windows = bucketsToWindows(buckets)

  return {
    contactId,
    windows,
    totalEvents: timelineEvents.length,
    analyzedAt: now.toISOString(),
  }
}

/**
 * Compute response time buckets from paired sent→received events.
 *
 * For each outbound message (message_sent), looks for the next inbound
 * (message_received) and records the response latency in the time bucket
 * corresponding to when the outbound was sent (in AEST).
 */
function computeResponseBuckets(events: TimelineEvent[]): Map<string, TimeBucket> {
  const buckets = new Map<string, TimeBucket>()

  for (let i = 0; i < events.length; i++) {
    const sent = events[i]
    if (sent.event_type !== 'message_sent') continue

    // Find the next message_received after this sent
    const received = findNextReceived(events, i + 1)
    if (!received) continue

    const sentTime = new Date(sent.occurred_at)
    const receivedTime = new Date(received.occurred_at)

    if (!isFinite(sentTime.getTime()) || !isFinite(receivedTime.getTime())) continue

    const latencyMs = receivedTime.getTime() - sentTime.getTime()
    if (latencyMs <= 0 || latencyMs > MAX_RESPONSE_LATENCY_MS) continue

    const latencyMinutes = latencyMs / (1000 * 60)

    // Convert to AEST for bucketing
    const aestTime = toAEST(sentTime)
    const dayOfWeek = aestTime.getUTCDay()
    const hour = aestTime.getUTCHours()

    const key = `${dayOfWeek}-${hour}`
    if (!buckets.has(key)) {
      buckets.set(key, { dayOfWeek, hour, responseTimes: [] })
    }
    buckets.get(key)!.responseTimes.push(latencyMinutes)
  }

  return buckets
}

/** Find the next message_received event starting from a given index. */
function findNextReceived(
  events: TimelineEvent[],
  startIndex: number,
): TimelineEvent | null {
  for (let j = startIndex; j < events.length; j++) {
    if (events[j].event_type === 'message_received') {
      return events[j]
    }
  }
  return null
}

/** Convert a UTC Date to AEST by adding the offset (for bucket calculation only). */
function toAEST(date: Date): Date {
  return new Date(date.getTime() + AEST_OFFSET_HOURS * 60 * 60 * 1000)
}

/** Convert time buckets to sorted OptimalContactWindow[] */
function bucketsToWindows(buckets: Map<string, TimeBucket>): OptimalContactWindow[] {
  const windows: OptimalContactWindow[] = []

  for (const bucket of buckets.values()) {
    if (bucket.responseTimes.length < MIN_SAMPLE_SIZE) continue

    const avg = bucket.responseTimes.reduce((sum, t) => sum + t, 0) / bucket.responseTimes.length

    windows.push({
      dayOfWeek: bucket.dayOfWeek,
      hourStart: bucket.hour,
      hourEnd: (bucket.hour + 1) % 24,
      avgResponseMinutes: Math.round(avg * 10) / 10,
      sampleSize: bucket.responseTimes.length,
    })
  }

  // Sort by fastest average response time
  windows.sort((a, b) => a.avgResponseMinutes - b.avgResponseMinutes)

  return windows
}

// ─── Scheduling Helper ───────────────────────────────────────────────────────

/**
 * Get the next optimal send time for a contact.
 *
 * Given a contact's optimal windows, returns the next future AEST time
 * that falls within the best window. If no windows, returns null (send immediately).
 */
export function getNextOptimalWindow(
  windows: OptimalContactWindow[],
  now?: Date,
): Date | null {
  if (windows.length === 0) return null

  const currentTime = now ?? new Date()
  const aestNow = toAEST(currentTime)
  const currentDay = aestNow.getUTCDay()
  const currentHour = aestNow.getUTCHours()

  // Try each window in order (already sorted by best response time)
  for (const window of windows) {
    const nextOccurrence = findNextOccurrence(window, currentDay, currentHour, currentTime)
    if (nextOccurrence) return nextOccurrence
  }

  // Fallback: use the best window's next occurrence regardless
  const best = windows[0]
  return findNextOccurrence(best, currentDay, currentHour, currentTime) ?? null
}

/** Find the next occurrence of a time window from current time, returning UTC Date. */
function findNextOccurrence(
  window: OptimalContactWindow,
  currentDay: number,
  currentHour: number,
  currentTime: Date,
): Date | null {
  // Calculate days until next occurrence of this window's day
  let daysUntil = window.dayOfWeek - currentDay
  if (daysUntil < 0) daysUntil += 7
  if (daysUntil === 0 && currentHour >= window.hourEnd) {
    daysUntil = 7 // Already past this window today
  }

  // Build the target AEST time
  const aestNow = toAEST(currentTime)
  const targetAEST = new Date(aestNow)
  targetAEST.setUTCDate(targetAEST.getUTCDate() + daysUntil)
  targetAEST.setUTCHours(window.hourStart, 0, 0, 0)

  // Convert back to UTC
  const utcTime = new Date(targetAEST.getTime() - AEST_OFFSET_HOURS * 60 * 60 * 1000)

  // Ensure it's in the future
  if (utcTime.getTime() <= currentTime.getTime()) {
    // Move to next week
    utcTime.setDate(utcTime.getDate() + 7)
  }

  return utcTime
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

/**
 * Compute optimal contact timing for all contacts in an org.
 *
 * Only processes contacts that have 10+ timeline events.
 * Stores results in both entity_patterns (pattern_type: 'optimal_contact_timing')
 * and contacts.communication_patterns.
 */
export async function computeAllContactTimings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BatchTimingResult> {
  const result: BatchTimingResult = {
    processed: 0,
    skipped: 0,
    errors: 0,
    results: [],
  }

  // Find contacts with sufficient timeline events
  // Use entity_timeline to count events per contact entity
  const { data: contactCounts, error: countError } = await supabase
    .rpc('get_contacts_with_event_counts', { p_org_id: orgId })

  // Fallback: if RPC doesn't exist, query contacts directly
  let contactIds: string[] = []

  if (countError || !contactCounts) {
    // Fallback: get all contacts and we'll check event counts during analysis
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)

    if (contactsError) {
      logger.error('[contact-timing] Failed to fetch contacts', {
        err: contactsError.message,
        orgId,
      })
      return result
    }

    contactIds = (contacts ?? []).map((c: { id: string }) => c.id)
  } else {
    contactIds = (contactCounts as { entity_id: string; event_count: number }[])
      .filter(c => c.event_count >= MIN_EVENTS_FOR_ANALYSIS)
      .map(c => c.entity_id)
  }

  for (const contactId of contactIds) {
    try {
      const timing = await analyzeContactTiming(supabase, orgId, contactId)

      if (timing.totalEvents < MIN_EVENTS_FOR_ANALYSIS) {
        result.skipped++
        continue
      }

      if (timing.windows.length === 0) {
        result.skipped++
        continue
      }

      // Store in entity_patterns
      await storeTimingPattern(supabase, orgId, contactId, timing)

      // Store in contacts.communication_patterns
      await updateContactPatterns(supabase, contactId, timing)

      result.processed++
      result.results.push(timing)
    } catch (err) {
      logger.error('[contact-timing] Failed to process contact', {
        err: err instanceof Error ? err.message : String(err),
        contactId,
      })
      result.errors++
    }
  }

  return result
}

/** Store timing results in entity_patterns table. */
async function storeTimingPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  timing: ContactTimingResult,
): Promise<void> {
  const { error } = await supabase.from('entity_patterns').upsert(
    {
      org_id: orgId,
      entity_type: 'contact',
      entity_id: contactId,
      pattern_type: 'optimal_contact_timing',
      pattern_data: {
        windows: timing.windows,
        totalEvents: timing.totalEvents,
        analyzedAt: timing.analyzedAt,
      },
      sample_count: timing.windows.reduce((sum, w) => sum + w.sampleSize, 0),
      confidence: computeConfidence(timing),
      extracted_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    },
    { onConflict: 'org_id,entity_type,entity_id,pattern_type' },
  )

  if (error) {
    logger.error('[contact-timing] Failed to store timing pattern', {
      err: error.message,
      contactId,
    })
  }
}

/** Update the contacts.communication_patterns jsonb with timing data. */
async function updateContactPatterns(
  supabase: SupabaseClient,
  contactId: string,
  timing: ContactTimingResult,
): Promise<void> {
  // Read existing patterns first
  const { data: contact, error: readError } = await supabase
    .from('contacts')
    .select('communication_patterns')
    .eq('id', contactId)
    .single()

  if (readError || !contact) return

  const existing = (contact.communication_patterns as Record<string, unknown>) ?? {}

  const { error } = await supabase
    .from('contacts')
    .update({
      communication_patterns: {
        ...existing,
        optimal_windows: timing.windows,
        timing_analyzed_at: timing.analyzedAt,
        timing_total_events: timing.totalEvents,
      },
    })
    .eq('id', contactId)

  if (error) {
    logger.error('[contact-timing] Failed to update contact patterns', {
      err: error.message,
      contactId,
    })
  }
}

/** Compute confidence score (0-1) based on sample sizes and window count. */
function computeConfidence(timing: ContactTimingResult): number {
  if (timing.windows.length === 0) return 0

  const totalSamples = timing.windows.reduce((sum, w) => sum + w.sampleSize, 0)

  // More windows and more samples = higher confidence
  const windowFactor = Math.min(timing.windows.length / 5, 1) // max at 5 windows
  const sampleFactor = Math.min(totalSamples / 50, 1) // max at 50 total samples

  return Math.round((windowFactor * 0.3 + sampleFactor * 0.7) * 100) / 100
}

// NOTE: Migration 064 adds 'optimal_contact_timing' to the entity_patterns
// CHECK constraint (was limited to 4 types in 061).
