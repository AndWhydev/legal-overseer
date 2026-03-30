import { withCronGuard } from '@/lib/cron/cron-guard'
import { scanSentimentDrift } from '@/lib/intelligence/sentiment-drift'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Sentiment Drift Detection cron route.
 * Scans all contacts per org for declining sentiment and alerts.
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs } = await supabase
      .from('organisations')
      .select('id')

    const results: Record<string, unknown>[] = []

    for (const org of orgs ?? []) {
      try {
        const scan = await scanSentimentDrift(supabase, org.id)

        // Notify for declining/critical contacts
        for (const alert of scan.alerts) {
          const urgency = alert.direction === 'critical' ? 'high' : 'normal'
          const causes = alert.correlations.length > 0
            ? ` Possible causes: ${alert.correlations.join(', ')}.`
            : ''

          await dispatchNotification(supabase, {
            org_id: org.id,
            title: `Sentiment declining: ${alert.contactName}`,
            body: `${alert.contactName}'s tone has shifted ${alert.direction === 'critical' ? 'sharply ' : ''}negative (${alert.previousScore.toFixed(1)} -> ${alert.currentScore.toFixed(1)}).${causes}`,
            urgency,
            channels: urgency === 'high' ? ['dashboard', 'email'] : ['dashboard'],
          }).catch(() => {/* fire and forget */})
        }

        results.push({
          orgId: org.id,
          scanned: scan.scanned,
          alerts: scan.alerts.length,
          errors: scan.errors,
        })
      } catch (err) {
        logger.error('[cron/sentiment-drift] Failed for org', {
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        })
        results.push({ orgId: org.id, error: String(err) })
      }
    }

    const totalAlerts = results.reduce((sum, r) => sum + ((r.alerts as number) ?? 0), 0)
    return {
      message: `Sentiment drift scan: ${results.length} orgs, ${totalAlerts} alerts`,
      details: { results },
    }
  })
}
