import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledRoles } from '@/lib/roles/role-scheduler'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const results = await runScheduledRoles(supabase)
    const triggered = results.filter(r => r.triggered).length
    return {
      message: `Role tick complete: ${triggered}/${results.length} roles triggered`,
      details: { roleTickResults: results },
    }
  })
}
