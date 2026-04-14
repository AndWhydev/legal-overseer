import { withCronGuard } from '@/lib/cron/cron-guard'
import { createConnectorManager } from '@/lib/connectors'
import type { OrgConnection } from '@/lib/connections'
import { logger } from '@/lib/core/logger'

// Next.js requires these route segment config exports to be static
// literals (not references), so we can't reuse the cron-guard constants here.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Connector refresh — refreshes OAuth tokens for connections whose
 * auth_expires_at is within 24h, so we can surface auth_expired in the
 * UI before the user is blocked mid-task.
 *
 * Runs every 15 minutes.
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const manager = createConnectorManager(supabase, { skipBridge: true })

    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error } = await supabase
      .from('org_connections')
      .select('*')
      .not('auth_expires_at', 'is', null)
      .lt('auth_expires_at', cutoff)
      .in('status', ['connected', 'needs_reauth', 'auth_expired'])
      .limit(200)

    if (error) {
      throw new Error(`[cron/connector-refresh] query failed: ${error.message}`)
    }

    let refreshed = 0
    let expired = 0
    let noop = 0
    const errors: string[] = []

    for (const row of (rows ?? []) as OrgConnection[]) {
      try {
        const result = await manager.refresh(row)
        if (result.kind === 'refreshed') {
          refreshed++
          await manager.health.report({
            connectionId: row.id,
            healthy: true,
            authExpiresAt: result.authExpiresAt,
          })
        } else if (result.kind === 'expired') {
          expired++
        } else {
          noop++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${row.id}: ${message}`)
        logger.warn('[cron/connector-refresh] refresh failed', {
          connectionId: row.id,
          error: message,
        })
      }
    }

    return {
      message: `Refresh sweep: ${refreshed} refreshed, ${expired} expired, ${noop} no-op, ${errors.length} errors`,
      details: { refreshed, expired, noop, errors: errors.slice(0, 20) },
    }
  })
}
