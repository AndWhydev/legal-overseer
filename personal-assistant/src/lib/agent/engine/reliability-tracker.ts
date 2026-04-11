/**
 * Execution Reliability Tracker
 *
 * Records success/failure per service per tier and surfaces aggregated
 * reliability data for model context injection. This is the learning signal
 * that makes the tool resolver improve over time.
 *
 * Design principles:
 * - recordExecution is fire-and-forget: never throws, never blocks the hot path
 * - getReliabilitySummary returns [] on any error (graceful degradation)
 * - formatReliabilityContext produces a markdown table for system prompt injection
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReliabilityTier = 'api' | 'browser' | 'workspace' | 'human'

export interface ExecutionRecord {
  org_id: string
  service_name: string
  tier: ReliabilityTier
  success: boolean
  error_category?: string | null
  error_message?: string | null
  latency_ms?: number | null
  cost_estimate_cents?: number | null
  task_id?: string | null
  tool_name?: string | null
  metadata?: Record<string, unknown>
}

export interface ReliabilitySummary {
  org_id: string
  service_name: string
  tier: ReliabilityTier
  total_executions: number
  success_rate: number
  avg_latency_ms: number | null
  avg_cost_cents: number | null
  most_common_error: string | null
}

// ---------------------------------------------------------------------------
// Service name inference
// ---------------------------------------------------------------------------

/**
 * Maps a tool name (and optionally its input) to a canonical service name.
 *
 * - send_gmail / send_email → "gmail"
 * - send_outlook → "outlook"
 * - spawn_browser_agent → extract domain from input.url
 * - spawn_ephemeral_workspace → "workspace"
 * - default: use tool name as-is
 */
export function inferServiceName(
  toolName: string,
  input?: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'send_gmail':
    case 'send_email':
      return 'gmail'

    case 'send_outlook':
      return 'outlook'

    case 'spawn_browser_agent': {
      const url = input?.url
      if (typeof url === 'string') {
        try {
          const hostname = new URL(url).hostname
          // Strip www. prefix for cleaner service names
          return hostname.replace(/^www\./, '')
        } catch {
          return 'browser_unknown'
        }
      }
      return 'browser_unknown'
    }

    case 'spawn_ephemeral_workspace':
      return 'workspace'

    default:
      return toolName
  }
}

// ---------------------------------------------------------------------------
// Record execution (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Insert an execution record. Never throws — logs and swallows errors.
 * Designed to be called without await in the hot path.
 */
export async function recordExecution(
  supabase: SupabaseClient,
  record: ExecutionRecord,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('execution_reliability')
      .insert({
        org_id: record.org_id,
        service_name: record.service_name,
        tier: record.tier,
        success: record.success,
        error_category: record.error_category ?? null,
        error_message: record.error_message ?? null,
        latency_ms: record.latency_ms ?? null,
        cost_estimate_cents: record.cost_estimate_cents ?? null,
        task_id: record.task_id ?? null,
        tool_name: record.tool_name ?? null,
        metadata: record.metadata ?? {},
      })

    if (error) {
      logger.warn('[reliability-tracker] Failed to record execution', {
        error: error.message,
        service: record.service_name,
      })
    }
  } catch (err) {
    logger.warn('[reliability-tracker] Failed to record execution', {
      error: err instanceof Error ? err.message : String(err),
      service: record.service_name,
    })
  }
}

// ---------------------------------------------------------------------------
// Query aggregation view
// ---------------------------------------------------------------------------

/**
 * Fetch the 7-day rolling reliability summary for an org.
 * Returns an empty array on any error (graceful degradation).
 */
export async function getReliabilitySummary(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ReliabilitySummary[]> {
  try {
    const { data, error } = await supabase
      .from('execution_reliability_summary')
      .select('*')
      .eq('org_id', orgId)

    if (error) {
      logger.warn('[reliability-tracker] Failed to query summary', {
        error: error.message,
        orgId,
      })
      return []
    }

    return (data ?? []) as ReliabilitySummary[]
  } catch (err) {
    logger.warn('[reliability-tracker] Failed to query summary', {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    })
    return []
  }
}

// ---------------------------------------------------------------------------
// Format for system prompt injection
// ---------------------------------------------------------------------------

/**
 * Format reliability summaries as a markdown table suitable for system prompt
 * injection. Returns an empty string if there are no summaries.
 */
export function formatReliabilityContext(
  summaries: ReliabilitySummary[],
): string {
  if (!summaries || summaries.length === 0) {
    return ''
  }

  const header = '| Service | Tier | Success Rate | Avg Latency | Avg Cost | Common Error |'
  const divider = '|---------|------|-------------|-------------|----------|--------------|'

  const rows = summaries.map((s) => {
    const rate = `${(s.success_rate * 100).toFixed(1)}%`
    const latency = s.avg_latency_ms != null ? `${s.avg_latency_ms}ms` : '-'
    const cost = s.avg_cost_cents != null ? `$${s.avg_cost_cents}` : '-'
    const error = s.most_common_error ?? '-'
    return `| ${s.service_name} | ${s.tier} | ${rate} | ${latency} | ${cost} | ${error} |`
  })

  return [
    '## Tool Reliability (7-day)',
    '',
    header,
    divider,
    ...rows,
  ].join('\n')
}
