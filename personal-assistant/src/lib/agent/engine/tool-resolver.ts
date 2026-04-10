/**
 * Tool Resolver — Tier Context Enrichment & Outcome Recording
 *
 * Injects reliability data into model context so the model can make
 * informed tier selection decisions. Records execution outcomes after
 * tool dispatch for the reliability feedback loop.
 *
 * The model carries the reasoning weight for tier selection; ToolResolver
 * provides the data and records the results.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getReliabilitySummary,
  formatReliabilityContext,
  inferServiceName,
  recordExecution,
  type ReliabilityTier,
} from './reliability-tracker'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierType = 'api' | 'browser' | 'workspace' | 'human'

// ---------------------------------------------------------------------------
// Tier mapping
// ---------------------------------------------------------------------------

/**
 * Maps a tool name to its execution tier.
 *
 * - spawn_browser_agent → browser
 * - spawn_ephemeral_workspace, workspace_* → workspace
 * - request_human_handoff → human
 * - everything else → api
 */
export function getTierForTool(toolName: string): TierType {
  switch (toolName) {
    case 'spawn_browser_agent':
      return 'browser'

    case 'spawn_ephemeral_workspace':
    case 'workspace_exec':
    case 'workspace_upload':
    case 'workspace_download':
    case 'workspace_destroy':
      return 'workspace'

    case 'request_human_handoff':
      return 'human'

    default:
      return 'api'
  }
}

// ---------------------------------------------------------------------------
// Tier descriptions (static, for system prompt)
// ---------------------------------------------------------------------------

const TIER_DESCRIPTIONS: Record<TierType, string> = {
  api: 'API — Direct service calls. Fastest, cheapest. Use when the service has a tool available.',
  browser: 'Browser — Headless browser agent. Slower (10-60s), higher cost. Use when no API exists or login/navigation is required.',
  workspace: 'Workspace — Ephemeral sandbox for code execution. Use for computation, file processing, or multi-step scripts.',
  human: 'Human — Escalate to a human operator. Use when confidence is low or the task requires human judgment.',
}

// ---------------------------------------------------------------------------
// Context block builder
// ---------------------------------------------------------------------------

/**
 * Build a system prompt section describing available execution tiers
 * and recent reliability data for the org.
 *
 * Returns a string suitable for injection into the system prompt.
 * Returns empty string if no reliability data exists (first-run scenario).
 */
export async function buildTierContextBlock(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  const sections: string[] = []

  // Static tier availability
  sections.push('## Available Execution Tiers')
  sections.push('')
  for (const [, description] of Object.entries(TIER_DESCRIPTIONS)) {
    sections.push(`- **${description.split(' — ')[0]}** — ${description.split(' — ').slice(1).join(' — ')}`)
  }

  // Dynamic reliability data
  const summaries = await getReliabilitySummary(supabase, orgId)
  const reliabilityTable = formatReliabilityContext(summaries)

  if (reliabilityTable) {
    sections.push('')
    sections.push(reliabilityTable)
    sections.push('')
    sections.push(
      'Use this reliability data to inform tool selection. ' +
      'Prefer tiers with higher success rates. ' +
      'If a service has low reliability via API, consider the browser tier as fallback.',
    )
  }

  return sections.join('\n')
}

// ---------------------------------------------------------------------------
// Outcome recording (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Record a tool execution outcome for the reliability feedback loop.
 *
 * Combines inferServiceName + getTierForTool + recordExecution.
 * Fire-and-forget: never throws, never blocks the hot path.
 */
export function recordToolOutcome(
  supabase: SupabaseClient,
  orgId: string,
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
  success: boolean,
  error?: string,
  latencyMs?: number,
): void {
  const serviceName = inferServiceName(toolName, toolInput)
  const tier: ReliabilityTier = getTierForTool(toolName)

  recordExecution(supabase, {
    org_id: orgId,
    service_name: serviceName,
    tier,
    success,
    error_message: error ?? null,
    latency_ms: latencyMs ?? null,
    tool_name: toolName,
  }).catch((err) => {
    logger.warn('[tool-resolver] recordToolOutcome failed', {
      error: err instanceof Error ? err.message : String(err),
      toolName,
    })
  })
}
