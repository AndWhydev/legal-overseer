import { withCronGuard } from '@/lib/cron/cron-guard'
import { createProvisioner, createImessageProvisioner, checkBridgeHealth } from '@/lib/bridges'
import { dispatchNotification } from '@/lib/notifications/dispatcher'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const provisioner = createProvisioner(supabase)
    const result = await checkBridgeHealth(supabase, provisioner)

    // iMessage BlueBubbles health checks
    const imessageProvisioner = createImessageProvisioner(supabase)
    const { data: imessageConns } = await supabase
      .from('org_connections')
      .select('id, config')
      .eq('provider', 'imessage')
      .eq('status', 'connected')

    for (const conn of imessageConns || []) {
      const cfg = conn.config as Record<string, string>
      if (!cfg.bb_server_url) continue
      result.checked++
      const healthy = await imessageProvisioner.checkHealth(cfg.bb_server_url, cfg.bb_password)
      if (healthy) {
        result.healthy++
      } else {
        result.errors.push(`${conn.id}: BlueBubbles server unreachable at ${cfg.bb_server_url}`)
      }
    }

    if (result.errors.length > 0) {
      console.error('[cron/bridge-health] errors:', result.errors)

      // Notify affected users about bridge failures
      for (const error of result.errors) {
        // Extract connection ID from error string (format: "conn-id: message")
        const connId = error.split(':')[0]?.trim()
        if (!connId) continue

        // Look up the connection to get org_id
        const { data: conn } = await supabase
          .from('org_connections')
          .select('org_id, provider, display_name')
          .eq('id', connId)
          .single()

        if (conn) {
          await dispatchNotification(supabase, {
            orgId: conn.org_id,
            type: 'alert_escalation',
            title: `${conn.display_name || conn.provider} bridge error`,
            body: `Your ${conn.display_name || conn.provider} bridge encountered an error and may not be receiving messages. We're attempting to restart it automatically.`,
            urgency: 'high',
            channels: ['dashboard'],
            metadata: {
              connection_id: connId,
              provider: conn.provider,
              error: error.split(':').slice(1).join(':').trim(),
            },
          })
        }
      }
    }

    return {
      message: `Health check: ${result.healthy}/${result.checked} healthy, ${result.errors.length} errors notified`,
      details: result,
    }
  })
}
