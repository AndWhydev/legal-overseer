/**
 * Workspace Lifecycle Manager — budget checks, completion, orphan sweeping
 *
 * Manages the full lifecycle of workspace sandbox sessions:
 * - Budget gating before creation (daily cost limits per org)
 * - Completion flow: destroy sandbox + update DB + record cost
 * - Orphan sweeping: find stale 'running' sessions and clean them up
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceProvider, WorkspaceStatus } from './types'
import {
  getDailyWorkspaceCost,
  updateWorkspaceStatus,
  getWorkspaceSession,
} from './workspace-store'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default daily cost limit per org in USD. */
const DEFAULT_DAILY_LIMIT_USD = 2.0

/** Workspaces running longer than this are considered orphaned (30 minutes). */
const ORPHAN_THRESHOLD_MS = 30 * 60 * 1000

// ---------------------------------------------------------------------------
// Budget check
// ---------------------------------------------------------------------------

export interface BudgetCheckResult {
  allowed: boolean
  currentCostUsd: number
  limitUsd: number
  remainingUsd: number
}

/**
 * Check whether the org is under its daily workspace budget.
 *
 * @param supabase  Authenticated Supabase client
 * @param orgId     Organisation ID
 * @param config    Optional overrides (dailyLimitUsd)
 * @returns Budget check result with current spend and remaining capacity
 */
export async function checkWorkspaceBudget(
  supabase: SupabaseClient,
  orgId: string,
  config?: { dailyLimitUsd?: number },
): Promise<BudgetCheckResult> {
  const limitUsd = config?.dailyLimitUsd ?? DEFAULT_DAILY_LIMIT_USD
  const currentCostUsd = await getDailyWorkspaceCost(supabase, orgId)
  const remainingUsd = Math.max(0, limitUsd - currentCostUsd)

  return {
    allowed: currentCostUsd < limitUsd,
    currentCostUsd,
    limitUsd,
    remainingUsd,
  }
}

// ---------------------------------------------------------------------------
// Complete workspace
// ---------------------------------------------------------------------------

/**
 * Complete a workspace session: destroy the sandbox, update DB status, record cost.
 *
 * If the provider destroy fails (sandbox may already be dead), the DB is still
 * updated so the session doesn't become an orphan.
 *
 * @param supabase     Authenticated Supabase client
 * @param provider     Workspace provider (E2B)
 * @param workspaceId  Workspace session ID (from workspace_sessions table)
 * @param status       Final status to record ('completed' | 'failed' | 'timeout')
 */
export async function completeWorkspace(
  supabase: SupabaseClient,
  provider: WorkspaceProvider,
  workspaceId: string,
  status: Extract<WorkspaceStatus, 'completed' | 'failed' | 'timeout'>,
): Promise<void> {
  const session = await getWorkspaceSession(supabase, workspaceId)

  if (!session) {
    logger.warn('[lifecycle] completeWorkspace called for unknown session', { workspaceId })
    return
  }

  // Destroy the sandbox — swallow errors since it may already be dead
  try {
    await provider.destroy(session.sandboxId)
  } catch (err) {
    logger.warn('[lifecycle] Provider destroy failed (continuing with DB update)', {
      workspaceId,
      sandboxId: session.sandboxId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Calculate final duration and cost
  const now = new Date()
  const startedAt = new Date(session.startedAt)
  const totalSeconds = Math.max(session.totalSeconds, (now.getTime() - startedAt.getTime()) / 1000)
  const costUsd = totalSeconds * 0.00035 // E2B_COST_PER_SECOND

  await updateWorkspaceStatus(supabase, workspaceId, status, {
    completedAt: now.toISOString(),
    totalSeconds,
    costUsd,
  })

  logger.info('[lifecycle] Workspace completed', {
    workspaceId,
    status,
    totalSeconds: Math.round(totalSeconds),
    costUsd: costUsd.toFixed(4),
  })
}

// ---------------------------------------------------------------------------
// Orphan sweeper
// ---------------------------------------------------------------------------

/**
 * Find and clean up workspaces stuck in 'running' status for too long.
 *
 * This catches cases where the process crashed or the destroy call was never
 * made. Workspaces running longer than ORPHAN_THRESHOLD_MS (30 min) are
 * destroyed and marked as 'timeout'.
 *
 * @param supabase  Authenticated Supabase client
 * @param provider  Workspace provider (E2B)
 * @returns Number of orphaned workspaces cleaned up
 */
export async function sweepOrphanedWorkspaces(
  supabase: SupabaseClient,
  provider: WorkspaceProvider,
): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString()

  const { data, error } = await supabase
    .from('workspace_sessions')
    .select('id, sandbox_id, started_at, total_seconds')
    .eq('status', 'running')
    .lt('started_at', cutoff)

  if (error) {
    logger.error('[lifecycle] Failed to query orphaned workspaces', { error: error.message })
    throw new Error(`Failed to query orphaned workspaces: ${error.message}`)
  }

  const orphans = data ?? []

  if (orphans.length === 0) {
    logger.info('[lifecycle] No orphaned workspaces found')
    return 0
  }

  logger.warn('[lifecycle] Found orphaned workspaces', { count: orphans.length })

  let cleaned = 0
  for (const orphan of orphans) {
    try {
      await completeWorkspace(supabase, provider, orphan.id, 'timeout')
      cleaned++
    } catch (err) {
      logger.error('[lifecycle] Failed to clean up orphaned workspace', {
        workspaceId: orphan.id,
        sandboxId: orphan.sandbox_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('[lifecycle] Orphan sweep complete', { found: orphans.length, cleaned })
  return cleaned
}
