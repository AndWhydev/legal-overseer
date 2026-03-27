import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledRoles } from '@/lib/roles/role-scheduler'

// Domain role modules -- import for registerRole() side effects.
// Without these, getRole() returns undefined and all role ticks silently skip.
import '@/lib/roles/finance/finance-role'
import '@/lib/roles/comms/comms-role'
import '@/lib/roles/sales/sales-role'

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
