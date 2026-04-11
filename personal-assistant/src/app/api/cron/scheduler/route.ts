import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledAgents } from '@/lib/agent/scheduler'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const results = await runScheduledAgents(supabase)
    return {
      message: `Scheduler tick complete, processed ${results.length} agent configs`,
      details: { agentScheduleResults: results },
    }
  })
}
