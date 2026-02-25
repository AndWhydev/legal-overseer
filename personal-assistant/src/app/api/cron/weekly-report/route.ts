import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type { WeeklyReportData } from '@/lib/notifications/email-templates'

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

  // This week: Mon-Sun
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - mondayOffset)
  thisWeekStart.setHours(0, 0, 0, 0)

  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  const thisWeekISO = thisWeekStart.toISOString()
  const prevWeekISO = prevWeekStart.toISOString()

  try {
    const [
      thisWeekRuns,
      prevWeekRuns,
      thisWeekLeads,
      prevWeekLeads,
      thisWeekCosts,
      prevWeekCosts,
      topAgents,
    ] = await Promise.all([
      supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', thisWeekISO),
      supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', prevWeekISO)
        .lt('created_at', thisWeekISO),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', thisWeekISO),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', prevWeekISO)
        .lt('created_at', thisWeekISO),
      supabase
        .from('agent_runs')
        .select('cost_usd')
        .eq('org_id', orgId)
        .gte('created_at', thisWeekISO),
      supabase
        .from('agent_runs')
        .select('cost_usd')
        .eq('org_id', orgId)
        .gte('created_at', prevWeekISO)
        .lt('created_at', thisWeekISO),
      supabase
        .from('agent_runs')
        .select('agent_config_id, status, agent_configs(name)')
        .eq('org_id', orgId)
        .gte('created_at', thisWeekISO),
    ])

    const sumCost = (rows: { cost_usd: number | null }[] | null) =>
      (rows ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)

    // Aggregate top agents
    const agentMap = new Map<string, { name: string; runs: number; successes: number }>()
    for (const run of (topAgents.data ?? []) as unknown as Array<{
      agent_config_id: string
      status: string
      agent_configs: { name: string } | null
    }>) {
      const id = run.agent_config_id
      if (!agentMap.has(id)) {
        agentMap.set(id, {
          name: run.agent_configs?.name ?? id,
          runs: 0,
          successes: 0,
        })
      }
      const entry = agentMap.get(id)!
      entry.runs++
      if (run.status === 'completed') entry.successes++
    }

    const topAgentsList = Array.from(agentMap.values())
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5)
      .map(a => ({
        name: a.name,
        runs: a.runs,
        successRate: a.runs > 0 ? a.successes / a.runs : 0,
      }))

    const reportData: WeeklyReportData = {
      weekStart: thisWeekStart.toLocaleDateString('en-AU', { dateStyle: 'medium' }),
      weekEnd: now.toLocaleDateString('en-AU', { dateStyle: 'medium' }),
      totalAgentRuns: thisWeekRuns.count ?? 0,
      previousWeekRuns: prevWeekRuns.count ?? 0,
      topAgents: topAgentsList,
      totalCost: sumCost(thisWeekCosts.data as { cost_usd: number | null }[] | null),
      previousWeekCost: sumCost(prevWeekCosts.data as { cost_usd: number | null }[] | null),
      leadsTotal: thisWeekLeads.count ?? 0,
      previousWeekLeads: prevWeekLeads.count ?? 0,
      pipelineValue: 0,
      previousWeekPipeline: 0,
    }

    const result = await dispatchNotification(supabase, {
      orgId,
      type: 'weekly_report',
      title: `Weekly Report: ${reportData.weekStart} - ${reportData.weekEnd}`,
      body: `${reportData.totalAgentRuns} agent runs, $${reportData.totalCost.toFixed(2)} cost, ${reportData.leadsTotal} leads`,
      urgency: 'low',
      channels: ['email', 'dashboard'],
      metadata: reportData as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ success: true, report: reportData, dispatch: result })
  } catch (err) {
    console.error('[cron/weekly-report] Error:', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
