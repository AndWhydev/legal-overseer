import { withCronGuard } from '@/lib/cron/cron-guard'
import { runBrainConsolidation, type BrainConsolidationReport } from '@/lib/brain/brain-consolidation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const reports: BrainConsolidationReport[] = []
    for (const org of orgs ?? []) {
      const report = await runBrainConsolidation(supabase, org.id)
      reports.push(report)
    }

    const totals = reports.reduce(
      (acc, r) => ({
        walEntries: acc.walEntries + r.walEntriesProcessed,
        facts: acc.facts + r.factsExtracted,
        dossiers: acc.dossiers + r.dossiersCompiled,
        domains: acc.domains + r.domainsUpdated,
        skipped: acc.skipped + r.entriesSkippedBySurprise,
      }),
      { walEntries: 0, facts: 0, dossiers: 0, domains: 0, skipped: 0 },
    )

    return {
      message: `Brain consolidation complete: ${totals.walEntries} entries, ${totals.dossiers} dossiers, ${totals.domains} profiles`,
      details: {
        orgsProcessed: reports.length,
        ...totals,
      },
    }
  })
}
