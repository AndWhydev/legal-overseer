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

  // Step 1b: Filter out signals that already have pending approvals
  if (supabase) {
    deduped = await filterAlreadyPending(supabase, orgId, deduped)
    if (deduped.length === 0) {
      logger.info("[proactive/aggregator] All signals filtered by pending approval check", { orgId })
      return []
    }
  }

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
// Cross-Run Deduplication (Approval Queue)
// ---------------------------------------------------------------------------

/**
 * Filter out signals that already have a pending approval in the queue.
 * This prevents the same signal (e.g., overdue invoice) from creating
 * a new approval entry on every cron run.
 *
 * Matches on action_type pattern "proactive:*" + entity identifiers
 * stored in action_payload.
 */
async function filterAlreadyPending(
  supabase: SupabaseClient,
  orgId: string,
  signals: ProactiveSignal[],
): Promise<ProactiveSignal[]> {
  try {
    // Fetch all pending proactive approvals for this org
    const { data: pendingApprovals, error } = await supabase
      .from("approval_queue")
      .select("action_type, action_payload")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .like("action_type", "proactive:%")

    if (error || !pendingApprovals?.length) {
      return signals // No pending approvals or error — allow all through
    }

    // Build a set of entity keys from pending approvals
    const pendingKeys = new Set<string>()
    for (const approval of pendingApprovals) {
      const payload = (approval.action_payload ?? {}) as Record<string, unknown>
      const key = buildApprovalDeduplicationKey(approval.action_type, payload)
      if (key) pendingKeys.add(key)
    }

    if (pendingKeys.size === 0) return signals

    // Filter out signals whose entity key matches an existing pending approval
    const filtered = signals.filter((signal) => {
      const signalKey = buildSignalDeduplicationKey(signal)
      if (!signalKey) return true // No key — allow through
      const isDuplicate = pendingKeys.has(signalKey)
      if (isDuplicate) {
        logger.info("[proactive/aggregator] Filtered duplicate signal (pending approval exists)", {
          signalType: signal.type,
          key: signalKey,
        })
      }
      return !isDuplicate
    })

    return filtered
  } catch (err) {
    logger.warn("[proactive/aggregator] filterAlreadyPending failed, allowing all signals", {
      error: err instanceof Error ? err.message : String(err),
    })
    return signals // Fail open
  }
}

/**
 * Build a dedup key from an existing approval_queue entry.
 * Maps action_type back to signal type and extracts entity IDs from payload.
 */
function buildApprovalDeduplicationKey(
  actionType: string,
  payload: Record<string, unknown>,
): string | null {
  // actionType is "proactive:alert_user", "proactive:create_task", etc.
  // The reasoning field contains entity info, but we need stable keys.
  // Extract from the nested action payload or reasoning.
  const reasoning = (payload.reasoning ?? "") as string

  // Try to extract invoice number from reasoning
  const invoiceMatch = reasoning.match(/Invoice\s+(INV-[\w-]+|[A-Z0-9-]+)/i)
  if (invoiceMatch) {
    return "invoice_overdue|" + invoiceMatch[1]
  }

  // Try to extract project name
  const projectMatch = reasoning.match(/Project\s+"([^"]+)"/i)
  if (projectMatch) {
    return actionType + "|project:" + projectMatch[1]
  }

  return null
}

/**
 * Build a dedup key from a signal, matching the format used by
 * buildApprovalDeduplicationKey so they can be compared.
 */
function buildSignalDeduplicationKey(signal: ProactiveSignal): string | null {
  const data = signal.data as Record<string, unknown>

  if (signal.type === "invoice_overdue" && data.invoice_number) {
    return "invoice_overdue|" + String(data.invoice_number)
  }

  if ((signal.type === "project_action_overdue" || signal.type === "project_blocked_stale") && data.project_name) {
    return "proactive:" + (signal.type === "project_action_overdue" ? "create_task" : "alert_user") + "|project:" + String(data.project_name)
  }

  return null
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
