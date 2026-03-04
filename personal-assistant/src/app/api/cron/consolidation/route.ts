import { withCronGuard } from '@/lib/cron/cron-guard'
import { consolidateMemories } from '@/lib/agent/memory-consolidation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    let totalMerged = 0
    let totalDeactivated = 0
    let totalKept = 0

    for (const org of orgs ?? []) {
      const result = await consolidateMemories(supabase, org.id)
      totalMerged += result.merged
      totalDeactivated += result.deactivated
      totalKept += result.kept
    }

    return {
      message: `Consolidation complete: ${totalMerged} merged, ${totalDeactivated} deactivated, ${totalKept} kept`,
      details: {
        orgsProcessed: orgs?.length ?? 0,
        totalMerged,
        totalDeactivated,
        totalKept,
      },
    }
  })
}
