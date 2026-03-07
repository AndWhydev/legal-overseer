import { withCronGuard } from '@/lib/cron/cron-guard'
import { checkAndSendAlerts } from '@/lib/whatsapp/proactive-alerts'
import { logger } from '@/lib/core/logger'

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

    const results: Record<string, unknown>[] = []
    let totalAlertsSent = 0

    for (const org of orgs ?? []) {
      const orgId = org.id

      try {
        // Get notification config for this org
        const { data: orgData } = await supabase
          .from('organisations')
          .select('settings')
          .eq('id', orgId)
          .single()

        const recipientPhone = orgData?.settings?.notify_phone

        if (!recipientPhone) {
          logger.info(`[cron/proactive-alerts] Skipping org ${orgId}: notify_phone not configured`)
          results.push({ orgId, alertsSent: 0, reason: 'notify_phone not configured' })
          continue
        }

        const alertsSent = await checkAndSendAlerts(supabase, orgId, recipientPhone as string)
        totalAlertsSent += alertsSent
        results.push({ orgId, alertsSent })
      } catch (orgErr) {
        console.error(`[cron/proactive-alerts] Failed processing for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Proactive alerts check complete for ${orgs?.length ?? 0} orgs (${totalAlertsSent} sent)`,
      details: { results, totalAlertsSent },
    }
  })
}
