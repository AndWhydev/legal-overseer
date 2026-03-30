import { withCronGuard } from '@/lib/cron/cron-guard'
import { ConsolidationPipeline } from '@/lib/memory-palace/consolidation-pipeline'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const pipeline = new ConsolidationPipeline(supabase)

    let totalDeduplicated = 0
    let totalDecayed = 0
    let totalPruned = 0

    for (const org of orgs ?? []) {
      const report = await pipeline.runForOrg(org.id)
      totalDeduplicated += report.merged
      totalDecayed += report.decayed
      totalPruned += report.archived
    }

    return {
      message: `Memory consolidation complete: ${totalDeduplicated} deduplicated, ${totalDecayed} decayed, ${totalPruned} pruned`,
      details: {
        orgsProcessed: orgs?.length ?? 0,
        deduplicated: totalDeduplicated,
        decayed: totalDecayed,
        pruned: totalPruned,
      },
    }
  })
}
