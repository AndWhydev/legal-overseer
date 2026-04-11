import type { RoleImplementation, RoleEvaluation, RoleAction, RoleInsight } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { registerRole } from '../role-registry'
import { logger } from '@/lib/core/logger'
import type { BuilderState, BuilderConfig } from './types'

// ---------------------------------------------------------------------------
// State accessor
// ---------------------------------------------------------------------------

/** Type-safe accessor for builder state fields */
function getBuilderState(state: Record<string, unknown>): BuilderState {
  return {
    last_generation_at: (state.last_generation_at as string) ?? null,
    active_project_ids: (state.active_project_ids as string[]) ?? [],
    total_sites_generated: (state.total_sites_generated as number) ?? 0,
    total_deployments: (state.total_deployments as number) ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Builder Role Implementation
// ---------------------------------------------------------------------------

/**
 * Builder role: website generation, template management, and deployment.
 *
 * The builder is primarily chat-driven (users ask to generate/revise sites
 * via conversation), but tick evaluations monitor for stale previews and
 * projects needing attention.
 *
 * Hourly tick checks for:
 * - Projects in 'generating' status that may be stuck
 * - Previews older than 7 days without deployment
 * - Active projects needing revision follow-up
 */
const builderRole: RoleImplementation = {
  type: 'builder',
  name: 'Builder',
  description: 'Website generation, template management, and deployment for client sites',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const tag = `[builder-role:${ctx.orgId.slice(0, 8)}]`
    logger.info(`${tag} Evaluating...`)

    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const builderState = getBuilderState(ctx.state.state ?? {})

    // -----------------------------------------------------------------------
    // 1. Check for stale generating projects (stuck > 10 minutes)
    // -----------------------------------------------------------------------
    try {
      const { data: generatingProjects } = await ctx.supabase
        .from('website_projects')
        .select('id, name, updated_at')
        .eq('org_id', ctx.orgId)
        .eq('status', 'generating')

      if (generatingProjects && generatingProjects.length > 0) {
        const staleThresholdMs = 10 * 60 * 1000 // 10 minutes
        for (const project of generatingProjects) {
          const ageMs = Date.now() - new Date(project.updated_at).getTime()
          if (ageMs > staleThresholdMs) {
            insights.push({
              summary: `Project "${project.name}" has been generating for ${Math.round(ageMs / 60000)} minutes and may be stuck`,
              details: { project_id: project.id, name: project.name, age_minutes: Math.round(ageMs / 60000) },
              priority: 'high',
            })
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Failed to check generating projects: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 2. Check for stale previews (> 7 days without deployment)
    // -----------------------------------------------------------------------
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: stalePreviewProjects } = await ctx.supabase
        .from('website_projects')
        .select('id, name, updated_at')
        .eq('org_id', ctx.orgId)
        .eq('status', 'preview')
        .lt('updated_at', sevenDaysAgo)

      if (stalePreviewProjects && stalePreviewProjects.length > 0) {
        for (const project of stalePreviewProjects) {
          insights.push({
            summary: `Preview for "${project.name}" is over 7 days old — consider deploying or archiving`,
            details: { project_id: project.id, name: project.name },
            priority: 'medium',
          })
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Failed to check stale previews: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 3. Build state updates
    // -----------------------------------------------------------------------
    const stateUpdates: Record<string, unknown> = {
      last_generation_at: builderState.last_generation_at,
      active_project_ids: builderState.active_project_ids,
      total_sites_generated: builderState.total_sites_generated,
      total_deployments: builderState.total_deployments,
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
    const lastTickAt = ctx.state.last_tick_at
    if (!lastTickAt) return true // Never ticked -> always check

    try {
      const { count } = await ctx.supabase
        .from('website_projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .gt('updated_at', lastTickAt)

      return (count ?? 0) > 0
    } catch {
      return false
    }
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 3600,    // Hourly check (builder is mostly chat-driven)
      daily_budget_cents: 200,        // $2/day
      autonomy_level: 'copilot',
      config: {
        auto_preview: true,
        default_template: null,
        wordpress_sites: [],
      },
    }
  },
}

// Auto-register on import
registerRole(builderRole)

export { builderRole }
