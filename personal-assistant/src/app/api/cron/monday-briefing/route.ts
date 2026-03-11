import { withCronGuard } from '@/lib/cron/cron-guard'
import { generateMondayBriefing, formatBriefingWhatsApp, formatBriefingEmail } from '@/lib/agent/briefing-generator'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { sendMessage as sendWhatsAppMessage } from '@/lib/channels/whatsapp'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Monday Morning Briefing cron route.
 * Schedule: Monday 6am AEST (Sunday 7pm UTC) -- see vercel.json
 *
 * Generates a comprehensive briefing for each org and delivers via:
 * 1. WhatsApp (if notify_phone configured)
 * 2. Email (via dispatchNotification)
 * 3. Dashboard notification
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id, settings')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results: Record<string, unknown>[] = []

    for (const org of orgs ?? []) {
      const orgId = org.id

      try {
        // Generate comprehensive briefing
        const briefing = await generateMondayBriefing(supabase, orgId)

        let whatsappSent = false
        let emailSent = false

        // Send via WhatsApp if phone configured
        const recipientPhone = org.settings?.notify_phone
        if (recipientPhone) {
          try {
            const whatsappText = formatBriefingWhatsApp(briefing)
            const messageId = await sendWhatsAppMessage(recipientPhone as string, whatsappText)
            whatsappSent = !!messageId
          } catch (waErr) {
            logger.warn(`[cron/monday-briefing] WhatsApp send failed for org ${orgId}`, {
              error: waErr instanceof Error ? waErr.message : String(waErr),
            })
          }
        }

        // Send via email + dashboard notification
        try {
          const { subject, html } = formatBriefingEmail(briefing)
          const dispatch = await dispatchNotification(supabase, {
            orgId,
            type: 'weekly_report', // Reuse weekly_report type for Monday briefing emails
            title: subject,
            body: `${briefing.summary.totalActionItems} action items, $${briefing.summary.pipelineValue.toLocaleString()} pipeline, ${briefing.summary.upcomingEvents} events this week`,
            urgency: briefing.summary.totalActionItems > 5 ? 'high' : 'normal',
            channels: ['email', 'dashboard'],
            metadata: {
              ...briefing.summary,
              briefingHtml: html,
              generatedAt: briefing.generatedAt,
            },
          })
          emailSent = dispatch.email
        } catch (emailErr) {
          logger.warn(`[cron/monday-briefing] Email dispatch failed for org ${orgId}`, {
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          })
        }

        results.push({
          orgId,
          whatsappSent,
          emailSent,
          actionItems: briefing.summary.totalActionItems,
          pipelineValue: briefing.summary.pipelineValue,
        })
      } catch (orgErr) {
        logger.error(`[cron/monday-briefing] Failed processing for org ${orgId}`, {
          error: orgErr instanceof Error ? orgErr.message : String(orgErr),
        })
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    const sentCount = results.filter((r: Record<string, unknown>) => r.whatsappSent || r.emailSent).length
    return {
      message: `Monday briefing processed for ${orgs?.length ?? 0} orgs (${sentCount} delivered)`,
      details: { results },
    }
  })
}
