import { withCronGuard } from '@/lib/cron/cron-guard'
import { runTriage } from '@/lib/agent/channel-triage'
import { logger } from '@/lib/core/logger';

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organisations: ${orgError.message}`)
    }

    if (!orgs || orgs.length === 0) {
      return { message: 'No organisations to process', details: { results: [] } }
    }

    const results: Record<string, unknown>[] = []

    for (const org of orgs) {
      const orgId = org.id
      try {
        const triageResult = await runTriage(supabase, orgId)

        const summary = `triage processed=${triageResult.processed} actionable=${triageResult.actionable} informational=${triageResult.informational} spam=${triageResult.spam} routed=${triageResult.routed.length}`
        logger.info(`[cron/triage] org=${orgId}: ${summary}`)

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
              logger.error(
                `[cron/triage] Failed to log activity for org ${orgId}:`,
                logErr.message,
              )
          })

        results.push({ orgId, triage: triageResult })
      } catch (orgErr) {
        const errMsg = orgErr instanceof Error ? orgErr.message : 'unknown_error'
        const errStack = orgErr instanceof Error ? orgErr.stack : undefined
        logger.error(`[cron/triage] Failed processing triage for org ${orgId}:`, { error: errMsg, stack: errStack })
        results.push({
          orgId,
          error: errMsg,
          stack: errStack?.split('\n').slice(0, 5).join(' | '),
        })
      }
    }

    return {
      message: `Triage processing complete for ${orgs.length} orgs`,
      details: { results },
    }
  })
}
