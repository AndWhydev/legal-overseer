import { withCronGuard } from '@/lib/cron/cron-guard'
import { runSentryTick } from '@/lib/agent/sentry'
import { processSentryEscalations } from '@/lib/agent/sentry-escalation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

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
        const { data: config, error: configError } = await supabase
          .from('agent_configs')
          .select('id')
          .eq('org_id', orgId)
          .eq('agent_type', 'sentry')
          .eq('enabled', true)
          .single()

        if (configError || !config) {
          console.warn(`[cron/sentry] No enabled sentry config for org ${orgId}`)
          continue
        }

        const sentryResult = await runSentryTick(supabase, orgId, config.id)
        const escalationResult = await processSentryEscalations(supabase, orgId)

        const summary = `sentry processed=${sentryResult.processed} triggered=${sentryResult.triggered} alerts=${sentryResult.alertsCreated} escalated=${escalationResult.escalated} failed=${escalationResult.failed}`
        console.log(`[cron/sentry] org=${orgId}: ${summary}`)

        await supabase
          .from('activity_feed')
          .insert({
            org_id: orgId,
            action_type: 'system',
            action: 'sentry_tick',
            result: summary,
          })
          .then(({ error: logErr }) => {
            if (logErr)
              console.error(
                `[cron/sentry] Failed to log activity for org ${orgId}:`,
                logErr.message,
              )
          })

        results.push({ orgId, sentry: sentryResult, escalation: escalationResult })
      } catch (orgErr) {
        console.error(`[cron/sentry] Failed processing sentry for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Sentry processing complete for ${orgs.length} orgs`,
      details: { results },
    }
  })
}
