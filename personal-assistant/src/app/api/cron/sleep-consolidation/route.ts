import { withCronGuard } from '@/lib/cron/cron-guard'
import { runSleepConsolidation } from '@/lib/memory-palace/sleep-consolidation'
import type { SleepConsolidationReport } from '@/lib/memory-palace/sleep-consolidation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organisations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organisations: ${orgError.message}`)
    }

    const reports: SleepConsolidationReport[] = []

    for (const org of orgs ?? []) {
      const report = await runSleepConsolidation(supabase, org.id)
      reports.push(report)
    }

    const totals = reports.reduce(
      (acc, r) => ({
        summarized: acc.summarized + r.summarized,
        conflictsResolved: acc.conflictsResolved + r.conflictsResolved,
        relationshipsDiscovered: acc.relationshipsDiscovered + r.relationshipsDiscovered,
        pruned: acc.pruned + r.pruned,
        briefingsGenerated: acc.briefingsGenerated + (r.briefingGenerated ? 1 : 0),
      }),
      { summarized: 0, conflictsResolved: 0, relationshipsDiscovered: 0, pruned: 0, briefingsGenerated: 0 },
    )

    return {
      message: `Sleep consolidation complete: ${totals.summarized} summarized, ${totals.conflictsResolved} conflicts resolved, ${totals.relationshipsDiscovered} relationships discovered, ${totals.pruned} pruned, ${totals.briefingsGenerated} briefings`,
      details: {
        orgsProcessed: orgs?.length ?? 0,
        ...totals,
        reports,
      },
    }
  })
}
