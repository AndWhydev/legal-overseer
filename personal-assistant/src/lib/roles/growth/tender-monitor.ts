import type { RoleAction, RoleInsight } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { runTenderHunterTick, filterTenders } from '@/lib/agent/tender-hunter'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrowthConfig {
  tender_enabled: boolean
}

// ---------------------------------------------------------------------------
// Tender Monitor Tick
// ---------------------------------------------------------------------------

/**
 * Run a tender scan and surface high-fit matches as RoleAction[].
 *
 * Wraps `runTenderHunterTick()` (scrape + upsert + auto-evaluate) and
 * `filterTenders()` (scored results). Surfaces tenders with fit_score >= 50
 * as actionable matches.
 */
export async function runTenderMonitorTick(ctx: RoleContext): Promise<{
  actions: RoleAction[]
  insights: RoleInsight[]
}> {
  const tag = `[tender-monitor:${ctx.orgId.slice(0, 8)}]`
  const config = ctx.config.config as unknown as GrowthConfig

  if (!config.tender_enabled) {
    return { actions: [], insights: [] }
  }

  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  try {
    // Run the tender scan
    const result = await runTenderHunterTick(ctx.supabase, ctx.orgId, ctx.config.id)

    if (result.newTenders > 0) {
      // Fetch scored tenders and filter to high-fit
      const filtered = await filterTenders(ctx.supabase, ctx.orgId)
      const highFit = filtered.filter((t) => (t.fit_score ?? 0) >= 50)

      // Surface top 5 high-fit tenders as actions
      for (const tender of highFit.slice(0, 5)) {
        actions.push({
          type: 'tender_match',
          summary: `New matching tender: ${tender.title} (fit ${tender.fit_score}/100)`,
          payload: {
            tenderId: tender.id,
            title: tender.title,
            source: tender.source,
            value: tender.value,
            deadline: tender.deadline,
            fitScore: tender.fit_score,
          },
          confidence: (tender.fit_score ?? 0) / 100,
          reversible: false,
        })
      }

      // Summary insight
      insights.push({
        summary: `Tender scan: ${result.newTenders} new tenders found, ${result.evaluated} evaluated, ${highFit.length} high-fit matches`,
        details: { ...result, highFitCount: highFit.length },
        priority: highFit.length > 0 ? 'high' : 'low',
      })
    }

    logger.info(
      `${tag} Complete: scanned=${result.scanned}, new=${result.newTenders}, ` +
      `actions=${actions.length}, insights=${insights.length}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`${tag} Tender scan failed: ${message}`)
  }

  return { actions, insights }
}
