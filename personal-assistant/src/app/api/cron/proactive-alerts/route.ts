import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { checkAndSendAlerts } from '@/lib/whatsapp/proactive-alerts'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const recipientPhone = process.env.WHATSAPP_ANDY_PHONE
    if (!recipientPhone) {
      throw new Error('WHATSAPP_ANDY_PHONE not configured')
    }

    const orgId = process.env.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'
    const alertsSent = await checkAndSendAlerts(supabase, orgId, recipientPhone)

    return {
      message: `Proactive alerts check complete, ${alertsSent} alerts sent`,
      details: { alertsSent },
    }
  })
}
