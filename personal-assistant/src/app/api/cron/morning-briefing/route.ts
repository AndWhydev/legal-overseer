import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { sendMorningBriefing } from '@/lib/whatsapp/morning-briefing'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const recipientPhone = process.env.WHATSAPP_ANDY_PHONE
    if (!recipientPhone) {
      throw new Error('WHATSAPP_ANDY_PHONE not configured')
    }

    const orgId = process.env.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'
    const result = await sendMorningBriefing(supabase, orgId, recipientPhone)

    return {
      message: result.sent ? 'Morning briefing sent' : 'Morning briefing skipped',
      details: { sent: result.sent, sections: result.sections },
    }
  })
}
