/**
 * Proactive Signal Aggregator
 *
 * Deduplicates, batches, and rate-limits proactive signals before they
 * reach the classifier. This prevents alert fatigue and ensures the
 * classifier operates on a clean, prioritised set of signals.
 *
 * @module proactive/aggregator
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ProactiveSignal } from './types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default deduplication window in milliseconds (30 minutes) */
const DEDUP_WINDOW_MS = 30 * 60 * 1000

/** Default max proactive actions per hour per org */
const DEFAULT_MAX_ACTIONS_PER_HOUR = 10

/** Maximum signals to send to the classifier in a single batch */
const MAX_SIGNALS_PER_BATCH = 50

// ---------------------------------------------------------------------------
// Main Aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregate, deduplicate, and prioritise proactive signals for an org.
 *
 * Steps:
 * 1. Deduplicate — remove signals with the same entity+type within the window
 * 2. Priority sort — critical/high signals first
 * 3. Rate-limit — check how many actions were already taken this hour
 * 4. Batch — cap at MAX_SIGNALS_PER_BATCH for the classifier
 *
 * @param signals - Raw signals gathered from intelligence workflows
 * @param orgId - Organisation ID for rate-limit tracking
 * @param supabase - Supabase client for rate-limit checks
 * @param maxActionsPerHour - Per-org rate limit (default: 10)
 * @returns Filtered and prioritised signals ready for classification
 */
export async function aggregateSignals(
  signals: ProactiveSignal[],
  orgId: string,
  supabase?: SupabaseClient,
  maxActionsPerHour?: number,
): Promise<ProactiveSignal[]> {
  if (signals.length === 0) {
    return []
  }

  logger.info('[proactive/aggregator] Starting aggregation', {
    orgId,
    inputCount: signals.length,
  })

  // Step 1: Deduplicate
  let deduped = deduplicateSignals(signals)

  // Step 2: Priority sort (critical first, then by recency)
  deduped = prioritySort(deduped)

  // Step 3: Rate-limit check
  if (supabase) {
    const limit = maxActionsPerHour ?? DEFAULT_MAX_ACTIONS_PER_HOUR
    const remaining = await getRemainingActionBudget(supabase, orgId, limit)
    if (remaining <= 0) {
      logger.info('[proactive/aggregator] Rate limit reached, returning only critical signals', {
        orgId,
        limit,
      })
      // Only allow critical signals through when rate-limited
      deduped = deduped.filter((s) => s.severity === 'critical')
    } else if (deduped.length > remaining) {
      // Trim to remaining budget (already sorted by priority)
      deduped = deduped.slice(0, remaining)
    }
  }

  // Step 4: Batch cap
  const result = deduped.slice(0, MAX_SIGNALS_PER_BATCH)

  logger.info('[proactive/aggregator] Aggregation complete', {
    orgId,
    inputCount: signals.length,
    outputCount: result.length,
  })

  return result
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicate signals that share the same type + entity key within the
 * deduplication window. When duplicates are found, keep the one with the
 * highest severity.
 */
function deduplicateSignals(signals: ProactiveSignal[]): ProactiveSignal[] {
  const seen = new Map<string, ProactiveSignal>()

  for (const signal of signals) {
    const key = buildDeduplicationKey(signal)
    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, signal)
      continue
    }

    // Check if within the dedup window
    const existingTime = new Date(existing.timestamp).getTime()
    const signalTime = new Date(signal.timestamp).getTime()

    if (Math.abs(signalTime - existingTime) <= DEDUP_WINDOW_MS) {
      // Keep the higher-severity signal
      if (severityRank(signal.severity) > severityRank(existing.severity)) {
        seen.set(key, signal)
      }
    } else {
      // Outside dedup window — keep both by appending timestamp to key
      seen.set(`${key}:${signal.timestamp}`, signal)
    }
  }

  return Array.from(seen.values())
}

/**
 * Build a deduplication key from signal type + entity identifiers in data.
 * Uses common entity fields: entity_id, contact_id, invoice_id, lead_id, etc.
 */
function buildDeduplicationKey(signal: ProactiveSignal): string {
  const entityKeys = [
    'entity_id',
    'contact_id',
    'invoice_id',
    'lead_id',
    'task_id',
    'message_id',
  ]
  const entityParts: string[] = [signal.type]

  for (const key of entityKeys) {
    if (signal.data[key]) {
      entityParts.push(`${key}:${String(signal.data[key])}`)
    }
  }

  // If no entity keys found, use source + first 100 chars of stringified data
  if (entityParts.length === 1) {
    entityParts.push(signal.source)
    const dataStr = JSON.stringify(signal.data).slice(0, 100)
    entityParts.push(dataStr)
  }

  return entityParts.join('|')
}

// ---------------------------------------------------------------------------
// Priority Sorting
// ---------------------------------------------------------------------------

/**
 * Sort signals by severity (critical first) then by recency (newest first).
 */
function prioritySort(signals: ProactiveSignal[]): ProactiveSignal[] {
  return [...signals].sort((a, b) => {
    // Severity rank (higher = more severe)
    const severityDiff = severityRank(b.severity) - severityRank(a.severity)
    if (severityDiff !== 0) return severityDiff

    // Recency (newer first)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Check how many proactive actions have been taken for this org in the
 * last hour and return the remaining budget.
 */
async function getRemainingActionBudget(
  supabase: SupabaseClient,
  orgId: string,
  maxPerHour: number,
): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('activity_feed')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('action_type', 'system')
      .like('action', 'proactive:%')
      .gte('created_at', oneHourAgo)

    if (error) {
      logger.warn('[proactive/aggregator] Rate limit check failed', {
        error: error.message,
        orgId,
      })
      // On error, allow actions through (fail open) but with a conservative limit
      return Math.max(1, Math.floor(maxPerHour / 2))
    }

    const used = count ?? 0
    return Math.max(0, maxPerHour - used)
  } catch (err) {
    logger.warn('[proactive/aggregator] Rate limit check error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return Math.max(1, Math.floor(maxPerHour / 2))
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityRank(severity: string): number {
  const ranks: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }
  return ranks[severity] ?? 0
}
