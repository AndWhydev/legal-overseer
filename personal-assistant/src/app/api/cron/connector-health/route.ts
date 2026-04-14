import { withCronGuard } from '@/lib/cron/cron-guard'
import { createConnectorManager } from '@/lib/connectors'
import { dispatchNotification } from '@/lib/notifications/dispatcher'

// Next.js requires these route segment config exports to be static
// literals (not references), so we can't reuse the cron-guard constants here.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Connector health sweep — runs the ConnectorLifecycle.healthCheck for
 * every connection whose transport is managed by the unified lifecycle
 * (composio / poll / webhook).
 *
 * Bridge transport is still handled by the dedicated /api/cron/bridge-health
 * endpoint during rollout to avoid double-probing Fly machines.
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const manager = createConnectorManager(supabase, { skipBridge: true })

    // IMPORTANT: We deliberately exclude transport='bridge' here.
    //
    // The existing /api/cron/bridge-health cron (every 5 min) owns Fly
    // machine + BlueBubbles health probing for bridge rows, and routes
    // its writes through the same ConnectionHealthReporter now. Running
    // both crons against the same rows risks double-reporting and
    // flapping consecutive_failures. When phase 7 merges the two
    // crons we can add 'bridge' here and retire the bridge-health cron.
    //
    // Covered by: src/app/api/cron/connector-health/__tests__/partition.test.ts
    const result = await manager.runHealthSweep({
      transports: ['composio', 'poll', 'webhook'],
      maxAgeMs: 60 * 60 * 1000, // 1h
      limit: 500,
    })

    if (result.unhealthy > 0) {
      // Dispatch one alert per unhealthy connection with >= 3 consecutive
      // failures. We re-query to find which ones crossed the threshold
      // during this sweep.
      const { data: escalated } = await supabase
        .from('org_connections')
        .select('id, org_id, provider, display_name, status, last_error, consecutive_failures')
        .gte('consecutive_failures', 3)
        .in('status', ['error', 'auth_expired', 'needs_reauth'])
        .limit(50)

      for (const conn of escalated ?? []) {
        await dispatchNotification(supabase, {
          orgId: conn.org_id as string,
          type: 'alert_escalation',
          title: `${conn.display_name || conn.provider} connection issue`,
          body:
            conn.status === 'auth_expired'
              ? `Your ${conn.display_name || conn.provider} connection needs to be re-authorised.`
              : `BitBit is having trouble reaching ${conn.display_name || conn.provider}: ${conn.last_error ?? 'unknown error'}`,
          urgency: 'high',
          channels: ['dashboard'],
          metadata: {
            connection_id: conn.id as string,
            provider: conn.provider as string,
            consecutive_failures: conn.consecutive_failures as number,
          },
        }).catch(() => {/* best-effort */})
      }
    }

    return {
      message: `Health sweep: ${result.healthy}/${result.checked} healthy, ${result.unhealthy} unhealthy`,
      details: result,
    }
  })
}
