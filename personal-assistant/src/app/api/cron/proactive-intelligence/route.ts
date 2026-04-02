/**
 * Cron Route: Proactive Intelligence
 *
 * Runs every 15 minutes (or on-demand). For each active organisation,
 * gathers intelligence signals, classifies them, and executes proactive
 * actions based on autonomy levels.
 *
 * Pattern matches existing cron routes: auth check via withCronGuard,
 * org iteration, structured error handling.
 *
 * Schedule: */15 * * * * (every 15 minutes)
 */

import { withCronGuard } from '@/lib/cron/cron-guard'
import { runProactiveAnalysis } from '@/lib/proactive'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organisations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results: Record<string, unknown>[] = []
    let totalActionsCreated = 0
    let orgsProcessed = 0
    let orgsSkipped = 0
    let orgsFailed = 0

    for (const org of orgs ?? []) {
      const orgId = org.id

      try {
        const actions = await runProactiveAnalysis(orgId, supabase)
        const actionCount = actions.length
        totalActionsCreated += actionCount
        orgsProcessed++

        if (actionCount > 0) {
          results.push({
            orgId,
            actions: actionCount,
            actionTypes: actions.map((a) => a.decision.action),
          })
        } else {
          results.push({ orgId, actions: 0 })
        }
      } catch (orgErr) {
        orgsFailed++
        const errorMsg = orgErr instanceof Error ? orgErr.message : String(orgErr)
        logger.error(`[cron/proactive-intelligence] Failed for org ${orgId}`, {
          error: errorMsg,
        })
        results.push({
          orgId,
          error: errorMsg,
        })
      }
    }

    return {
      message: `Proactive intelligence complete: ${orgsProcessed} orgs processed, ${totalActionsCreated} actions created, ${orgsFailed} failed`,
      details: {
        results,
        summary: {
          totalOrgs: orgs?.length ?? 0,
          orgsProcessed,
          orgsSkipped,
          orgsFailed,
          totalActionsCreated,
        },
      },
    }
  }, { resilience: true })
}
