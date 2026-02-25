import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type { DigestData } from '@/lib/notifications/email-templates'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (
    process.env.CRON_SECRET &&
    request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  const orgId = process.env.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  try {
    // Aggregate today's activity
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

    // Add notable items
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

    const result = await dispatchNotification(supabase, {
      orgId,
      type: 'daily_digest',
      title: `Daily Digest - ${digestData.date}`,
      body: `${digestData.agentRuns} agent runs, ${approvalsPending} approvals pending, ${digestData.leadsReceived} leads`,
      urgency: 'low',
      channels: ['email', 'dashboard'],
      metadata: digestData as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ success: true, digest: digestData, dispatch: result })
  } catch (err) {
    console.error('[cron/daily-digest] Error:', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
