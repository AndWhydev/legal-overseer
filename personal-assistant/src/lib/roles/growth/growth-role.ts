import type { RoleImplementation, RoleEvaluation, RoleAction, RoleInsight } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { registerRole } from '../role-registry'
import { runSeoMonitorTick } from './seo-monitor'
import { runTenderMonitorTick } from './tender-monitor'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Growth-Specific State Schema
// ---------------------------------------------------------------------------

/**
 * Shape of the JSONB stored in role_states.state for the growth role.
 * All fields are optional for backward compat with existing state rows.
 */
export interface GrowthState {
  last_seo_audit_at: string | null
  last_tender_scan_at: string | null
  seo_audit_interval_hours: number
  tender_scan_interval_hours: number
}

/**
 * Growth config fields stored in role_configs.config JSONB.
 */
export interface GrowthConfig {
  seo_enabled: boolean
  tender_enabled: boolean
  seo_audit_interval_hours: number
  tender_scan_interval_hours: number
  seo_brand_name?: string
  seo_domain?: string
  seo_queries?: string[]
  seo_competitors?: string[]
}

/** Type-safe accessor for growth state fields */
function getGrowthState(state: Record<string, unknown>): GrowthState {
  return {
    last_seo_audit_at: (state.last_seo_audit_at as string) ?? null,
    last_tender_scan_at: (state.last_tender_scan_at as string) ?? null,
    seo_audit_interval_hours: (state.seo_audit_interval_hours as number) ?? 24,
    tender_scan_interval_hours: (state.tender_scan_interval_hours as number) ?? 24,
  }
}

/** Check if enough time has elapsed since a given timestamp. */
function hasIntervalElapsed(lastRunAt: string | null, intervalHours: number): boolean {
  if (!lastRunAt) return true // Never run -> always elapsed
  const ageMs = Date.now() - new Date(lastRunAt).getTime()
  const intervalMs = intervalHours * 3600000
  return ageMs >= intervalMs
}

// ---------------------------------------------------------------------------
// Growth Role Implementation
// ---------------------------------------------------------------------------

/**
 * Growth role: SEO monitoring, tender hunting, and growth opportunity detection.
 *
 * Wraps existing SEO visibility audit and Tender Hunter infrastructure
 * into the role-tick scheduling system, enabling proactive monitoring
 * without chat invocation.
 *
 * Sub-intervals gate actual work:
 * - SEO audit: default every 24 hours
 * - Tender scan: default every 24 hours
 * The role tick fires hourly but only runs sub-tasks when their interval elapses.
 */
const growthRole: RoleImplementation = {
  type: 'growth',
  name: 'Growth',
  description: 'SEO monitoring, tender hunting, and growth opportunity detection',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const tag = `[growth-role:${ctx.orgId.slice(0, 8)}]`
    logger.info(`${tag} Evaluating...`)

    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const growthState = getGrowthState(ctx.state.state ?? {})
    const config = (ctx.config.config ?? {}) as unknown as GrowthConfig
    const now = new Date()

    // Read interval settings from config (override state defaults)
    const seoIntervalHours = config.seo_audit_interval_hours ?? growthState.seo_audit_interval_hours
    const tenderIntervalHours = config.tender_scan_interval_hours ?? growthState.tender_scan_interval_hours

    // -------------------------------------------------------------------
    // 1. SEO monitoring (default: daily)
    // -------------------------------------------------------------------
    if (config.seo_enabled !== false && hasIntervalElapsed(growthState.last_seo_audit_at, seoIntervalHours)) {
      try {
        const seoResult = await runSeoMonitorTick(ctx)
        actions.push(...seoResult.actions)
        insights.push(...seoResult.insights)
        growthState.last_seo_audit_at = now.toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`${tag} SEO monitor tick failed: ${message}`)
      }
    }

    // -------------------------------------------------------------------
    // 2. Tender scanning (default: daily)
    // -------------------------------------------------------------------
    if (config.tender_enabled !== false && hasIntervalElapsed(growthState.last_tender_scan_at, tenderIntervalHours)) {
      try {
        const tenderResult = await runTenderMonitorTick(ctx)
        actions.push(...tenderResult.actions)
        insights.push(...tenderResult.insights)
        growthState.last_tender_scan_at = now.toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`${tag} Tender monitor tick failed: ${message}`)
      }
    }

    // -------------------------------------------------------------------
    // 3. Build state updates
    // -------------------------------------------------------------------
    const stateUpdates: Record<string, unknown> = {
      last_seo_audit_at: growthState.last_seo_audit_at,
      last_tender_scan_at: growthState.last_tender_scan_at,
      seo_audit_interval_hours: seoIntervalHours,
      tender_scan_interval_hours: tenderIntervalHours,
    }

    logger.info(
      `${tag} Complete: ${actions.length} actions, ${insights.length} insights`,
    )

    return {
      actions,
      insights,
      stateUpdates,
      workflowsToStart: [],
    }
  },

  // -------------------------------------------------------------------------
  // Haiku pre-screen: has anything changed since last tick?
  // -------------------------------------------------------------------------

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    const growthState = getGrowthState(ctx.state.state ?? {})
    const config = (ctx.config.config ?? {}) as unknown as GrowthConfig

    const seoIntervalHours = config.seo_audit_interval_hours ?? growthState.seo_audit_interval_hours
    const tenderIntervalHours = config.tender_scan_interval_hours ?? growthState.tender_scan_interval_hours

    return (
      hasIntervalElapsed(growthState.last_seo_audit_at, seoIntervalHours) ||
      hasIntervalElapsed(growthState.last_tender_scan_at, tenderIntervalHours)
    )
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 3600,    // Check hourly (actual work is gated by sub-intervals)
      daily_budget_cents: 200,         // $2/day
      autonomy_level: 'copilot',
      config: {
        seo_enabled: true,
        tender_enabled: true,
        seo_audit_interval_hours: 24,  // Daily SEO audit
        tender_scan_interval_hours: 24, // Daily tender scan
      },
    }
  },
}

// Auto-register on import
registerRole(growthRole)

export { growthRole }
