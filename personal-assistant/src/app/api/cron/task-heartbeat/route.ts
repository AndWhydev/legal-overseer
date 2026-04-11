import { withCronGuard } from '@/lib/cron/cron-guard'
import { detectAndRecoverOrphans } from '@/lib/agent/tasks/heartbeat-monitor'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const result = await detectAndRecoverOrphans(supabase)
    return {
      message: `Heartbeat scan complete: ${result.recovered} recovered, ${result.deadLettered} dead-lettered`,
      details: result,
    }
  })
}
