import { withCronGuard } from '@/lib/cron/cron-guard'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type { DigestData } from '@/lib/notifications/email-templates'
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

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const results: Record<string, unknown>[] = []

    // Track email addresses that already received a digest in this run
    // to prevent duplicate emails when multiple orgs share the same recipient
    const emailedRecipients = new Set<string>()

    for (const org of orgs ?? []) {
      const orgId = org.id

      try {
        const [agentRuns, approvals, leads, invoices, alerts] = await Promise.all([
          supabase
            .from('agent_runs')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', todayStart),
          supabase
            .from('approval_queue')
            .select('id, status', { count: 'exact' })
            .eq('org_id', orgId)
            .gte('created_at', todayStart),
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', todayStart),
          supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', todayStart),
          supabase
            .from('sentry_alerts')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .gte('created_at', todayStart),
        ])

        const approvalRows = approvals.data ?? []
        const approvalsProcessed = approvalRows.filter(
          (a: { status: string }) => a.status !== 'pending',
        ).length
        const approvalsPending = approvalRows.filter(
          (a: { status: string }) => a.status === 'pending',
        ).length

        const digestData: DigestData = {
          date: now.toLocaleDateString('en-AU', { dateStyle: 'medium' }),
          agentRuns: agentRuns.count ?? 0,
          approvalsProcessed,
          approvalsPending,
          leadsReceived: leads.count ?? 0,
          invoicesSent: invoices.count ?? 0,
          alertsTriggered: alerts.count ?? 0,
          topItems: [],
        }

        if (approvalsPending > 0) {
          digestData.topItems.push({
            label: 'Pending Approvals',
            detail: `${approvalsPending} awaiting review`,
          })
        }
        if ((alerts.count ?? 0) > 0) {
          digestData.topItems.push({
            label: 'Alerts',
            detail: `${alerts.count} alerts triggered today`,
          })
        }

        // Determine which channels to use for this org.
        // Always insert a dashboard notification (scoped per org).
        // Only send email if the recipient hasn't already received one this run,
        // preventing duplicate emails when multiple orgs share the same address.
        const toEmail = (process.env.NOTIFICATION_TO_EMAIL || 'hi@torkay.com').toLowerCase()
        const channels: ('email' | 'dashboard')[] = emailedRecipients.has(toEmail)
          ? ['dashboard']
          : ['email', 'dashboard']

        const dispatchResult = await dispatchNotification(supabase, {
          orgId,
          type: 'daily_digest',
          title: `Daily Digest - ${digestData.date}`,
          body: `${digestData.agentRuns} agent runs, ${approvalsPending} approvals pending, ${digestData.leadsReceived} leads`,
          urgency: 'low',
          channels,
          metadata: digestData as unknown as Record<string, unknown>,
        })

        // Mark this recipient as already emailed
        if (channels.includes('email')) {
          emailedRecipients.add(toEmail)
        }

        results.push({ orgId, digest: digestData, dispatch: dispatchResult })
      } catch (orgErr) {
        logger.error(`[cron/daily-digest] Failed processing for org ${orgId}`, { error: orgErr instanceof Error ? orgErr.message : String(orgErr) })
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Daily digest dispatched for ${orgs?.length ?? 0} orgs (${emailedRecipients.size} email(s) sent)`,
      details: { results },
    }
  })
}
