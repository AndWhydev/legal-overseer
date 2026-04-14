import { withCronGuard } from '@/lib/cron/cron-guard'
import { createConnectorManager } from '@/lib/connectors'
import { alertUnhealthyConnections } from '@/lib/connectors/alerting'

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

    const alerts = result.unhealthy > 0
      ? await alertUnhealthyConnections(supabase, { minFailures: 3, maxPerInvocation: 50 })
      : { alerted: 0, skipped: 0, errors: [] }

    return {
      message: `Health sweep: ${result.healthy}/${result.checked} healthy, ${result.unhealthy} unhealthy, ${alerts.alerted} alerts (${alerts.skipped} dedup)`,
      details: { ...result, alerts },
    }
  })
}
