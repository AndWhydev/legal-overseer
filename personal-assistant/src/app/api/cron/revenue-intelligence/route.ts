import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { refreshSnapshots } from '@/lib/revenue/snapshot-engine'
import { refreshClientScores } from '@/lib/revenue/client-scoring'
import { runUnbilledDetection } from '@/lib/revenue/unbilled-detector'
import { runCollectionAnalysis } from '@/lib/revenue/collection-engine'
import { runCashFlowProjection } from '@/lib/revenue/cashflow-engine'
import { runRetainerMonitoring } from '@/lib/revenue/retainer-monitor'
import { runWeeklyDigest } from '@/lib/revenue/weekly-digest'
import { logger } from '@/lib/core/logger'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

/**
 * GET /api/cron/revenue-intelligence
 *
 * Runs the full revenue intelligence pipeline for all orgs:
 * 1. Compute revenue snapshots
 * 2. Score clients
 * 3. Detect unbilled work
 * 4. Analyze collections
 * 5. Project cash flow
 * 6. Monitor retainers
 * 7. Generate weekly digest (Mondays only)
 *
 * Recommended schedule: daily at 06:00 AEST
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results: Array<{
      orgId: string
      snapshots?: { saved: number; errors: number }
      clientScores?: { scored: number; errors: number }
      unbilled?: { proposals: number; saved: number }
      collections?: { overdue: number; insightsSaved: number }
      cashflow?: { saved: number; errors: number }
      retainers?: { alerts: number; saved: number }
      digest?: { stored: boolean }
      error?: string
    }> = []

    let totalOrgs = 0
    let totalErrors = 0

    for (const org of orgs ?? []) {
      const orgId = org.id
      totalOrgs++

      try {
        // 1. Revenue snapshots
        const snapshots = await refreshSnapshots(supabase, orgId)

        // 2. Client scoring
        const clientScores = await refreshClientScores(supabase, orgId)

        // 3. Unbilled work detection
        const { proposals, saved: unbilledSaved } = await runUnbilledDetection(supabase, orgId)

        // 4. Collection analysis
        const { summary, insightsSaved: collectionInsights } = await runCollectionAnalysis(supabase, orgId)

        // 5. Cash flow projections
        const { saved: cfSaved, errors: cfErrors } = await runCashFlowProjection(supabase, orgId)

        // 6. Retainer monitoring
        const { alerts, saved: retainerSaved } = await runRetainerMonitoring(supabase, orgId)

        // 7. Weekly digest (only on Mondays)
        const isMonday = new Date().getDay() === 1
        let digestResult: { stored: boolean } | undefined

        if (isMonday) {
          const { stored } = await runWeeklyDigest(supabase, orgId)
          digestResult = { stored }
        }

        results.push({
          orgId,
          snapshots,
          clientScores,
          unbilled: { proposals: proposals.length, saved: unbilledSaved },
          collections: { overdue: summary.overdue_count, insightsSaved: collectionInsights },
          cashflow: { saved: cfSaved, errors: cfErrors },
          retainers: { alerts: alerts.length, saved: retainerSaved },
          digest: digestResult,
        })
      } catch (orgErr) {
        totalErrors++
        logger.error(`[cron/revenue-intelligence] Failed for org ${orgId}`, {
          error: orgErr instanceof Error ? orgErr.message : String(orgErr),
        })
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Revenue intelligence pipeline completed for ${totalOrgs} org(s) with ${totalErrors} error(s)`,
      details: {
        organizations_processed: totalOrgs,
        errors: totalErrors,
        results,
      },
    }
  })
}
