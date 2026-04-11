/**
 * Sleep-Time Compute Engine
 *
 * Background processing that runs during idle periods to:
 * 1. Consolidate episodic memories → semantic knowledge
 * 2. Refresh stale entity profiles
 * 3. Decay low-value memories
 * 4. Detect patterns across accumulated observations
 *
 * Inspired by Letta's sleep-time compute paper (April 2025):
 * "AI agents use idle time to pre-process information, form connections,
 * and rewrite their memory state."
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SleepTimeResult {
  orgId: string
  memoriesDecayed: number
  profilesRefreshed: number
  patternsDetected: number
  durationMs: number
}

// ─── Decay Constants ─────────────────────────────────────────────────────────

/** Decay half-lives in hours */
const DECAY_HALF_LIVES: Record<string, number> = {
  slow: 30 * 24,     // 30 days
  normal: 7 * 24,    // 7 days
  fast: 2 * 24,      // 2 days
  never: Infinity,    // never decays
}

/** Memories below this confidence after decay are deactivated */
const DECAY_DEACTIVATION_THRESHOLD = 0.15

// ─── Main Sleep-Time Compute ─────────────────────────────────────────────────

/**
 * Run sleep-time compute for a single org.
 * Designed to be called from a cron job during low-activity periods.
 */
export async function runSleepTimeCompute(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SleepTimeResult> {
  const start = Date.now()
  let memoriesDecayed = 0
  let profilesRefreshed = 0
  let patternsDetected = 0

  // Phase 1: Decay stale memories
  memoriesDecayed = await decayMemories(supabase, orgId)

  // Phase 2: Refresh stale entity profiles
  profilesRefreshed = await refreshStaleProfiles(supabase, orgId)

  // Phase 3: Detect patterns in recent observations
  patternsDetected = await detectPatterns(supabase, orgId)

  // Phase 4: Refresh pre-computed briefing packets
  let briefingsGenerated = 0
  try {
    const { refreshBriefings } = await import('./briefing-packets')
    const result = await refreshBriefings(supabase, orgId)
    briefingsGenerated = result.stored
  } catch (err) {
    logger.warn('[sleep-time] Briefing refresh failed', { orgId, error: err instanceof Error ? err.message : String(err) })
  }

  const durationMs = Date.now() - start

  logger.info('[sleep-time] Compute complete', {
    orgId,
    memoriesDecayed,
    profilesRefreshed,
    patternsDetected,
    briefingsGenerated,
    durationMs,
  })

  return { orgId, memoriesDecayed, profilesRefreshed, patternsDetected, durationMs }
}

// ─── Phase 1: Memory Decay ──────────────────────────────────────────────────

/**
 * Apply temporal decay to memories based on their decay_rate.
 * Reduces confidence of stale memories and deactivates those below threshold.
 */
async function decayMemories(supabase: SupabaseClient, orgId: string): Promise<number> {
  try {
    const { data: memories } = await supabase
      .from('semantic_memories')
      .select('id, confidence, decay_rate, updated_at')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .neq('decay_rate', 'never')
      .limit(200)

    if (!memories || memories.length === 0) return 0

    let decayed = 0
    const now = Date.now()

    for (const memory of memories) {
      const rate = memory.decay_rate ?? 'normal'
      const halfLife = DECAY_HALF_LIVES[rate] ?? DECAY_HALF_LIVES.normal
      if (halfLife === Infinity) continue

      const ageHours = (now - new Date(memory.updated_at).getTime()) / (1000 * 60 * 60)
      const decayFactor = Math.pow(0.5, ageHours / halfLife)
      const newConfidence = memory.confidence * decayFactor

      if (newConfidence < DECAY_DEACTIVATION_THRESHOLD) {
        // Deactivate — below usefulness threshold
        await supabase
          .from('semantic_memories')
          .update({ is_active: false, confidence: newConfidence })
          .eq('id', memory.id)
        decayed++
      } else if (newConfidence < memory.confidence - 0.05) {
        // Only update if decay is significant (>5% drop)
        await supabase
          .from('semantic_memories')
          .update({ confidence: newConfidence })
          .eq('id', memory.id)
        decayed++
      }
    }

    return decayed
  } catch (err) {
    logger.warn('[sleep-time] Memory decay failed', { orgId, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}

// ─── Phase 2: Profile Refresh ───────────────────────────────────────────────

/**
 * Find and refresh entity profiles that are stale (older than their valid_until).
 */
async function refreshStaleProfiles(supabase: SupabaseClient, orgId: string): Promise<number> {
  try {
    const { data: staleProfiles } = await supabase
      .from('entity_profiles')
      .select('entity_id, entity_type')
      .eq('org_id', orgId)
      .lt('valid_until', new Date().toISOString())
      .limit(10)

    if (!staleProfiles || staleProfiles.length === 0) return 0

    const { computeEntityProfile } = await import('@/lib/context/entity-profile-builder')

    let refreshed = 0
    for (const profile of staleProfiles) {
      try {
        await computeEntityProfile(supabase, {
          orgId,
          entityType: profile.entity_type,
          entityId: profile.entity_id,
        })
        refreshed++
      } catch {
        // Individual profile refresh failure shouldn't stop others
      }
    }

    return refreshed
  } catch (err) {
    logger.warn('[sleep-time] Profile refresh failed', { orgId, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}

// ─── Phase 3: Pattern Detection ─────────────────────────────────────────────

/**
 * Scan recent entity timeline events for recurring patterns.
 * Detects: payment timing patterns, communication frequency, recurring topics.
 */
async function detectPatterns(supabase: SupabaseClient, orgId: string): Promise<number> {
  try {
    // Find entities with 5+ recent timeline events (enough data for pattern detection)
    const { data: activeEntities } = await supabase
      .from('entity_timeline')
      .select('entity_id')
      .eq('org_id', orgId)
      .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(500)

    if (!activeEntities || activeEntities.length === 0) return 0

    // Count events per entity
    const eventCounts = new Map<string, number>()
    for (const event of activeEntities) {
      eventCounts.set(event.entity_id, (eventCounts.get(event.entity_id) ?? 0) + 1)
    }

    // Only analyze entities with 5+ events
    const candidates = [...eventCounts.entries()]
      .filter(([, count]) => count >= 5)
      .map(([entityId]) => entityId)
      .slice(0, 10)

    let patternsFound = 0

    for (const entityId of candidates) {
      const { data: events } = await supabase
        .from('entity_timeline')
        .select('event_type, occurred_at, event_data')
        .eq('org_id', orgId)
        .eq('entity_id', entityId)
        .order('occurred_at', { ascending: true })
        .limit(50)

      if (!events || events.length < 5) continue

      // Detect communication frequency pattern
      const messageEvents = events.filter(e =>
        e.event_type === 'message_received' || e.event_type === 'message_sent'
      )

      if (messageEvents.length >= 3) {
        const gaps = []
        for (let i = 1; i < messageEvents.length; i++) {
          const gap = new Date(messageEvents[i].occurred_at).getTime() -
                     new Date(messageEvents[i - 1].occurred_at).getTime()
          gaps.push(gap / (1000 * 60 * 60 * 24)) // convert to days
        }

        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
        const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length)

        // If communication is regular (low std dev relative to mean), store the pattern
        if (stdDev < avgGap * 0.5 && avgGap > 0.5) {
          const patternContent = `Communication frequency: approximately every ${Math.round(avgGap)} days`

          // Check if we already have this pattern
          const { data: existing } = await supabase
            .from('semantic_memories')
            .select('id')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .contains('entity_ids', [entityId])
            .ilike('content', '%communication frequency%')
            .limit(1)

          if (!existing || existing.length === 0) {
            await supabase.from('semantic_memories').insert({
              org_id: orgId,
              content: `[pattern] ${patternContent}`,
              category: 'general',
              confidence: 0.65,
              entity_ids: [entityId],
              is_active: true,
              decay_rate: 'normal',
            })
            patternsFound++
          }
        }
      }
    }

    return patternsFound
  } catch (err) {
    logger.warn('[sleep-time] Pattern detection failed', { orgId, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}
