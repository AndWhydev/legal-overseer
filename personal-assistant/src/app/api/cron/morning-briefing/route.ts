import { withCronGuard } from '@/lib/cron/cron-guard'
import { sendMorningBriefing } from '@/lib/whatsapp/morning-briefing'
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
          logger.info(`[cron/morning-briefing] Skipping org ${orgId}: notify_phone not configured`)
          results.push({ orgId, sent: false, reason: 'notify_phone not configured' })
          continue
        }

        const result = await sendMorningBriefing(supabase, orgId, recipientPhone as string)
        results.push({ orgId, sent: result.sent, sections: result.sections })
      } catch (orgErr) {
        console.error(`[cron/morning-briefing] Failed processing for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    const sent = results.filter((r: any) => r.sent).length
    return {
      message: `Morning briefing processed for ${orgs?.length ?? 0} orgs (${sent} sent)`,
      details: { results },
    }
  })
}
