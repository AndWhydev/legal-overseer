/**
 * Connection-health alerting.
 *
 * Called by /api/cron/connector-health whenever a sweep finds
 * connections that have crossed the failure threshold. Extracted into
 * its own module so the dashboard, cron, and any future manual "run
 * now" action share the same dispatch logic.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../core/logger'
import { dispatchNotification } from '../notifications/dispatcher'

export interface AlertOptions {
  /** Only alert on rows with at least this many consecutive failures. */
  minFailures?: number
  /** Hard cap on how many notifications we fire per invocation. */
  maxPerInvocation?: number
}

export interface AlertSummary {
  alerted: number
  skipped: number
  errors: string[]
}

interface AlertableRow {
  id: string
  org_id: string
  provider: string
  display_name: string | null
  status: string
  last_error: string | null
  consecutive_failures: number
  last_alert_at: string | null
}

/**
 * Dispatch user-facing alerts for unhealthy connections.
 *
 * Deduplicated — we only alert once per 6h per connection by reading
 * `last_alert_at` off the connection row. That column doesn't exist
 * yet; we store the timestamp in config.last_alert_at instead so we
 * can ship this without another migration.
 */
export async function alertUnhealthyConnections(
  supabase: SupabaseClient,
  opts: AlertOptions = {},
): Promise<AlertSummary> {
  const minFailures = opts.minFailures ?? 3
  const maxPer = opts.maxPerInvocation ?? 50

  const { data, error } = await supabase
    .from('org_connections')
    .select('id, org_id, provider, display_name, status, last_error, consecutive_failures, config')
    .gte('consecutive_failures', minFailures)
    .in('status', ['error', 'auth_expired', 'needs_reauth'])
    .limit(maxPer)

  if (error) {
    return { alerted: 0, skipped: 0, errors: [error.message] }
  }

  const rows = (data ?? []) as Array<AlertableRow & { config: Record<string, unknown> }>
  const summary: AlertSummary = { alerted: 0, skipped: 0, errors: [] }
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000

  for (const row of rows) {
    const lastAlertAt = (row.config?.last_alert_at as string | undefined)
    if (lastAlertAt && new Date(lastAlertAt).getTime() > sixHoursAgo) {
      summary.skipped++
      continue
    }

    try {
      await dispatchNotification(supabase, {
        orgId: row.org_id,
        type: 'alert_escalation',
        title: `${row.display_name || row.provider} connection issue`,
        body:
          row.status === 'auth_expired' || row.status === 'needs_reauth'
            ? `Your ${row.display_name || row.provider} connection needs to be re-authorised.`
            : `BitBit is having trouble reaching ${row.display_name || row.provider}: ${row.last_error ?? 'unknown error'}`,
        urgency: 'high',
        channels: ['dashboard'],
        metadata: {
          connection_id: row.id,
          provider: row.provider,
          consecutive_failures: row.consecutive_failures,
        },
      })

      await supabase
        .from('org_connections')
        .update({
          config: { ...(row.config ?? {}), last_alert_at: new Date().toISOString() },
        })
        .eq('id', row.id)

      summary.alerted++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      summary.errors.push(`${row.id}: ${message}`)
      logger.warn('[connectors/alerting] dispatch failed', {
        connectionId: row.id,
        error: message,
      })
    }
  }

  return summary
}
