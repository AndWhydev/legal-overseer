import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { runScheduledAgents } from '@/lib/agent/scheduler'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const results = await runScheduledAgents(supabase)
    return {
      message: `Scheduler tick complete, processed ${results.length} agent configs`,
      details: { agentScheduleResults: results },
    }
  })
}
