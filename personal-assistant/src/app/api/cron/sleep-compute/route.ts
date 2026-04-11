import { withCronGuard } from '@/lib/cron/cron-guard'
import { runSleepTimeCompute } from '@/lib/intelligence/sleep-time-compute'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Sleep-Time Compute cron route.
 * Schedule: Every 2 hours (see vercel.json)
 *
 * Runs background memory consolidation for all orgs:
 * - Decays stale memories based on typed decay rates
 * - Refreshes stale entity profiles
 * - Detects patterns in accumulated observations
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results = []
    let totalDecayed = 0
    let totalRefreshed = 0
    let totalPatterns = 0

    for (const org of orgs ?? []) {
      try {
        const result = await runSleepTimeCompute(supabase, org.id)
        totalDecayed += result.memoriesDecayed
        totalRefreshed += result.profilesRefreshed
        totalPatterns += result.patternsDetected
        results.push(result)
      } catch (err) {
        logger.error('[cron/sleep-compute] Failed for org', {
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        })
        results.push({
          orgId: org.id,
          error: err instanceof Error ? err.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Sleep-time compute: ${totalDecayed} memories decayed, ${totalRefreshed} profiles refreshed, ${totalPatterns} patterns detected`,
      details: {
        orgs: orgs?.length ?? 0,
        totalDecayed,
        totalRefreshed,
        totalPatterns,
        results,
      },
    }
  })
}
