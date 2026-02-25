import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelType, ChannelAdapter } from './types'

// ---------------------------------------------------------------------------
// Channel health checker
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export interface ChannelHealthReport {
  channel: ChannelType
  status: HealthStatus
  latencyMs: number
  checkedAt: string
  error?: string
}

/**
 * Check health of a single channel adapter by calling isAvailable()
 * and measuring latency.
 */
export async function checkAdapterHealth(
  adapter: ChannelAdapter,
): Promise<ChannelHealthReport> {
  const start = Date.now()
  const checkedAt = new Date().toISOString()

  try {
    const available = await Promise.race([
      adapter.isAvailable(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000)),
    ])

    const latencyMs = Date.now() - start

    if (available === 'timeout') {
      return { channel: adapter.type, status: 'down', latencyMs, checkedAt, error: 'Health check timed out' }
    }

    if (!available) {
      return { channel: adapter.type, status: 'down', latencyMs, checkedAt, error: 'Adapter not available (missing credentials or config)' }
    }

    // Degraded if latency > 5s
    const status: HealthStatus = latencyMs > 5000 ? 'degraded' : 'healthy'
    return { channel: adapter.type, status, latencyMs, checkedAt }
  } catch (err) {
    return {
      channel: adapter.type,
      status: 'down',
      latencyMs: Date.now() - start,
      checkedAt,
      error: String(err),
    }
  }
}

/**
 * Check health of all provided adapters in parallel.
 */
export async function checkAllChannelHealth(
  adapters: ChannelAdapter[],
): Promise<ChannelHealthReport[]> {
  return Promise.all(adapters.map(checkAdapterHealth))
}

/**
 * Persist health reports to Supabase for dashboard consumption.
 */
export async function storeHealthReports(
  client: SupabaseClient,
  orgId: string,
  reports: ChannelHealthReport[],
): Promise<void> {
  for (const report of reports) {
    await client
      .from('channel_health')
      .upsert(
        {
          org_id: orgId,
          channel_type: report.channel,
          status: report.status,
          latency_ms: report.latencyMs,
          checked_at: report.checkedAt,
          error: report.error || null,
        },
        { onConflict: 'org_id,channel_type' },
      )
  }
}
