import type { RoleAction, RoleInsight } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { runVisibilityAudit, getPreviousAudits, detectVisibilityChanges } from '@/lib/agent/ai-visibility-audit'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SEO Monitor Tick
// ---------------------------------------------------------------------------

/**
 * Run an SEO visibility audit and detect changes from previous audit.
 *
 * Uses the pure `detectVisibilityChanges()` function (NOT `checkVisibilityChanges()`
 * which has notification side effects that would cause double-notify).
 *
 * Maps results to RoleAction[] (ranking drops) and RoleInsight[] (scores, changes).
 */
export async function runSeoMonitorTick(ctx: RoleContext): Promise<{
  actions: RoleAction[]
  insights: RoleInsight[]
}> {
  const tag = `[seo-monitor:${ctx.orgId.slice(0, 8)}]`
  const config = ctx.config.config as unknown as GrowthConfig

  // Guard: disabled or missing required config
  if (!config.seo_enabled) {
    return { actions: [], insights: [] }
  }

  if (!config.seo_brand_name || !config.seo_queries?.length) {
    logger.info(`${tag} Skipping: missing required config (brand_name or queries)`)
    return { actions: [], insights: [] }
  }

  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  try {
    // Run the visibility audit
    const audit = await runVisibilityAudit(ctx.supabase, ctx.orgId, {
      domain: config.seo_domain ?? '',
      brandName: config.seo_brand_name,
      queries: config.seo_queries,
      competitors: config.seo_competitors,
    })

    // Fetch previous audit for comparison
    const previous = await getPreviousAudits(ctx.supabase, ctx.orgId, 1)

    // Detect changes using the PURE function (no side effects)
    const changes = previous.length > 0
      ? detectVisibilityChanges(audit, previous[0])
      : []

    // Critically low score -> high-priority insight
    if (audit.overallScore < 30) {
      insights.push({
        summary: `AI visibility critically low: ${audit.overallScore}/100`,
        details: { score: audit.overallScore, recommendations: audit.recommendations },
        priority: 'high',
      })
    }

    // Map changes to actions and insights
    for (const change of changes) {
      if (change.severity === 'info') continue

      if (change.type === 'lost_mention' || change.type === 'score_change') {
        actions.push({
          type: 'seo_ranking_drop',
          summary: change.detail,
          payload: {
            change,
            recommendations: audit.recommendations.slice(0, 3),
          },
          confidence: 0.85,
          reversible: false,
        })

        // Critical ranking drops -> dispatch alert notification
        if (change.severity === 'critical') {
          try {
            await dispatchNotification(ctx.supabase, {
              orgId: ctx.orgId,
              type: 'alert_escalation',
              title: 'SEO Visibility Drop Detected',
              body: `${change.detail}. ${audit.recommendations[0] ?? 'Review your AI search presence.'}`,
              urgency: 'high',
              channels: ['dashboard', 'email'],
              metadata: { change, recommendations: audit.recommendations.slice(0, 3) },
            })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.warn(`${tag} Failed to dispatch critical alert: ${message}`)
          }
        }
      } else {
        insights.push({
          summary: change.detail,
          details: { change },
          priority: change.severity === 'critical' ? 'high' : 'medium',
        })
      }
    }

    logger.info(
      `${tag} Complete: score=${audit.overallScore}, changes=${changes.length}, ` +
      `actions=${actions.length}, insights=${insights.length}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`${tag} SEO audit failed: ${message}`)
  }

  return { actions, insights }
}
