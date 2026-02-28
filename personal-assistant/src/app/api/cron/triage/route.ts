import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { runTriage } from '@/lib/agent/channel-triage'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    if (!orgs || orgs.length === 0) {
      return { message: 'No organizations to process', details: { results: [] } }
    }

    const results: Record<string, unknown>[] = []

    for (const org of orgs) {
      const orgId = org.id
      try {
        const triageResult = await runTriage(supabase, orgId)

        const summary = `triage processed=${triageResult.processed} actionable=${triageResult.actionable} informational=${triageResult.informational} spam=${triageResult.spam} routed=${triageResult.routed.length}`
        console.log(`[cron/triage] org=${orgId}: ${summary}`)

        await supabase
          .from('activity_feed')
          .insert({
            org_id: orgId,
            action_type: 'system',
            action: 'channel_triage',
            result: summary,
          })
          .then(({ error: logErr }) => {
            if (logErr)
              console.error(
                `[cron/triage] Failed to log activity for org ${orgId}:`,
                logErr.message,
              )
          })

        results.push({ orgId, triage: triageResult })
      } catch (orgErr) {
        console.error(`[cron/triage] Failed processing triage for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Triage processing complete for ${orgs.length} orgs`,
      details: { results },
    }
  })
}
