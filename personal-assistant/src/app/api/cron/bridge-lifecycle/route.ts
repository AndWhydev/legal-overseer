import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { createProvisioner, suspendIdleBridges } from '@/lib/bridges'
import { dispatchNotification } from '@/lib/notifications/dispatcher'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const provisioner = createProvisioner(supabase)
    const result = await suspendIdleBridges(supabase, provisioner)

    // Notify on suspension errors (not on successful suspensions — those are routine)
    if (result.errors.length > 0) {
      console.error('[cron/bridge-lifecycle] errors:', result.errors)

      for (const error of result.errors) {
        const connId = error.split(':')[0]?.trim()
        if (!connId) continue

        const { data: conn } = await supabase
          .from('org_connections')
          .select('org_id, provider, display_name')
          .eq('id', connId)
          .single()

        if (conn) {
          await dispatchNotification(supabase, {
            orgId: conn.org_id,
            type: 'agent_error',
            title: `Failed to suspend ${conn.display_name || conn.provider} bridge`,
            body: `The idle bridge could not be suspended. It may continue running and incurring costs.`,
            urgency: 'normal',
            channels: ['dashboard'],
            metadata: { connection_id: connId, error: error.split(':').slice(1).join(':').trim() },
          })
        }
      }
    }

    return {
      message: `Lifecycle: ${result.suspended} bridges suspended, ${result.errors.length} errors`,
      details: result,
    }
  })
}
