import { withCronGuard } from '@/lib/cron/cron-guard'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type { WeeklyReportData } from '@/lib/notifications/email-templates'

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

    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - mondayOffset)
    thisWeekStart.setHours(0, 0, 0, 0)

    const prevWeekStart = new Date(thisWeekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)

    const thisWeekISO = thisWeekStart.toISOString()
    const prevWeekISO = prevWeekStart.toISOString()

    const results: Record<string, unknown>[] = []

    for (const org of orgs ?? []) {
      const orgId = org.id

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

        const agentMap = new Map<string, { name: string; runs: number; successes: number }>()
        for (const run of (topAgents.data ?? []) as unknown as Array<{
          agent_config_id: string
          status: string
          agent_configs: { name: string } | null
        }>) {
          const id = run.agent_config_id
          if (!agentMap.has(id)) {
            agentMap.set(id, { name: run.agent_configs?.name ?? id, runs: 0, successes: 0 })
          }
          const entry = agentMap.get(id)!
          entry.runs++
          if (run.status === 'completed') entry.successes++
        }

        const topAgentsList = Array.from(agentMap.values())
          .sort((a, b) => b.runs - a.runs)
          .slice(0, 5)
          .map((a) => ({
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

        const dispatchResult = await dispatchNotification(supabase, {
          orgId,
          type: 'weekly_report',
          title: `Weekly Report: ${reportData.weekStart} - ${reportData.weekEnd}`,
          body: `${reportData.totalAgentRuns} agent runs, $${reportData.totalCost.toFixed(2)} cost, ${reportData.leadsTotal} leads`,
          urgency: 'low',
          channels: ['email', 'dashboard'],
          metadata: reportData as unknown as Record<string, unknown>,
        })

        results.push({ orgId, report: reportData, dispatch: dispatchResult })
      } catch (orgErr) {
        console.error(`[cron/weekly-report] Failed processing for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Weekly report dispatched for ${orgs?.length ?? 0} orgs`,
      details: { results },
    }
  })
}
