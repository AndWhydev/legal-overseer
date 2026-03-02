import { withCronGuard } from '@/lib/cron/cron-guard'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type { DigestData } from '@/lib/notifications/email-templates'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

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

    const dispatchResult = await dispatchNotification(supabase, {
      orgId,
      type: 'daily_digest',
      title: `Daily Digest - ${digestData.date}`,
      body: `${digestData.agentRuns} agent runs, ${approvalsPending} approvals pending, ${digestData.leadsReceived} leads`,
      urgency: 'low',
      channels: ['email', 'dashboard'],
      metadata: digestData as unknown as Record<string, unknown>,
    })

    return {
      message: `Daily digest dispatched for ${digestData.date}`,
      details: { digest: digestData, dispatch: dispatchResult },
    }
  })
}
