import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CronStat {
  route: string
  last_run: string | null
  success_rate_24h: number
  avg_duration_ms: number
  error_count_24h: number
}

interface AgentLatency {
  total_runs: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  error_rate: number
}

interface ChannelHealthEntry {
  channel: string
  status: string
  latency_ms: number
  last_sync: string | null
  error_count_24h: number
}

interface ErrorEntry {
  agent_type: string
  count: number
  latest_error: string
  latest_at: string
}

interface TokenSpendEntry {
  org_id: string
  org_name: string
  total_tokens_24h: number
  total_cost_24h: number
}

interface MonitoringResponse {
  cron_stats: CronStat[]
  agent_latency: AgentLatency
  channel_health: ChannelHealthEntry[]
  error_summary: ErrorEntry[]
  token_spend: TokenSpendEntry[]
  generated_at: string
}

// All known cron routes
const CRON_ROUTES = [
  'archive-threads',
  'billing',
  'calibrate-confidence',
  'channel-sync',
  'consolidation',
  'contact-timing',
  'daily-digest',
  'entity-profile-refresh',
  'intelligence',
  'monday-briefing',
  'monthly-report',
  'morning-briefing',
  'proactive-alerts',
  'process-embeddings',
  'relationship-health',
  'revenue-intelligence',
  'role-tick',
  'scheduler',
  'sentry',
  'sleep-compute',
  'token-refresh',
  'triage',
  'weekly-report',
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ---------------------------------------------------------------------------
// GET /api/admin/monitoring
// ---------------------------------------------------------------------------

export async function GET() {
  // Auth: require admin user
  const userClient = await createClient()
  if (!userClient) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 503 })
  }

  const supabase = getServiceClient()
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  try {
    // Run all queries in parallel
    const [
      cronResult,
      agentRunsResult,
      channelHealthResult,
      dlqResult,
      tokenSpendResult,
    ] = await Promise.all([
      // 1. Cron stats from activity_feed (system actions)
      supabase
        .from('activity_feed')
        .select('action, created_at, metadata')
        .like('action', 'cron_%')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(2000),

      // 2. Agent runs for latency
      supabase
        .from('agent_runs')
        .select('id, status, duration_ms, tokens_in, tokens_out, cost_estimate, org_id, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(5000),

      // 3. Channel health
      supabase
        .from('channel_health')
        .select('channel_type, status, latency_ms, checked_at, error')
        .order('checked_at', { ascending: false }),

      // 4. Dead letter queue
      supabase
        .from('dead_letter_queue')
        .select('id, agent_type, error_message, created_at')
        .is('resolved_at', null)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(200),

      // 5. Token spend by org
      supabase
        .from('agent_runs')
        .select('org_id, tokens_in, tokens_out, cost_estimate')
        .gte('created_at', twentyFourHoursAgo),
    ])

    // ── 1. Cron stats ──────────────────────────────────────────────────────
    const cronEntries = cronResult.data ?? []
    const cronByRoute = new Map<string, { successes: number; failures: number; durations: number[]; lastRun: string | null }>()

    // Initialize all known routes
    for (const route of CRON_ROUTES) {
      cronByRoute.set(route, { successes: 0, failures: 0, durations: [], lastRun: null })
    }

    for (const entry of cronEntries) {
      // Extract route from action like "cron_channel-sync" or "cron_channel_sync"
      const routeName = (entry.action as string).replace('cron_', '').replace(/_/g, '-')
      const existing = cronByRoute.get(routeName) ?? { successes: 0, failures: 0, durations: [], lastRun: null }

      const meta = entry.metadata as Record<string, unknown> | null
      const success = meta?.success !== false
      const durationMs = typeof meta?.duration_ms === 'number' ? meta.duration_ms : 0

      if (success) {
        existing.successes++
      } else {
        existing.failures++
      }
      if (durationMs > 0) {
        existing.durations.push(durationMs)
      }
      if (!existing.lastRun || (entry.created_at as string) > existing.lastRun) {
        existing.lastRun = entry.created_at as string
      }

      cronByRoute.set(routeName, existing)
    }

    const cron_stats: CronStat[] = CRON_ROUTES.map(route => {
      const stats = cronByRoute.get(route)!
      const total = stats.successes + stats.failures
      return {
        route: `/api/cron/${route}`,
        last_run: stats.lastRun,
        success_rate_24h: total > 0 ? Math.round((stats.successes / total) * 100) : 0,
        avg_duration_ms: stats.durations.length > 0
          ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
          : 0,
        error_count_24h: stats.failures,
      }
    })

    // ── 2. Agent latency ─────────────────────────────────────────────────
    const agentRuns = agentRunsResult.data ?? []
    const durations = agentRuns
      .map(r => r.duration_ms as number | null)
      .filter((d): d is number => typeof d === 'number' && d > 0)
      .sort((a, b) => a - b)

    const errorRuns = agentRuns.filter(r => r.status === 'error').length

    const agent_latency: AgentLatency = {
      total_runs: agentRuns.length,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      p99_ms: percentile(durations, 99),
      error_rate: agentRuns.length > 0 ? Math.round((errorRuns / agentRuns.length) * 100) : 0,
    }

    // ── 3. Channel health ────────────────────────────────────────────────
    const healthRows = channelHealthResult.data ?? []
    // Deduplicate: keep latest per channel
    const latestByChannel = new Map<string, typeof healthRows[0]>()
    for (const row of healthRows) {
      if (!latestByChannel.has(row.channel_type)) {
        latestByChannel.set(row.channel_type, row)
      }
    }

    const channel_health: ChannelHealthEntry[] = Array.from(latestByChannel.values()).map(row => ({
      channel: row.channel_type,
      status: row.status,
      latency_ms: row.latency_ms,
      last_sync: row.checked_at,
      error_count_24h: row.error ? 1 : 0,
    }))

    // ── 4. Error summary ─────────────────────────────────────────────────
    const dlqEntries = dlqResult.data ?? []
    const errorByType = new Map<string, { count: number; latest_error: string; latest_at: string }>()

    for (const entry of dlqEntries) {
      const agentType = entry.agent_type as string
      const existing = errorByType.get(agentType)
      if (!existing) {
        errorByType.set(agentType, {
          count: 1,
          latest_error: entry.error_message as string,
          latest_at: entry.created_at as string,
        })
      } else {
        existing.count++
        if ((entry.created_at as string) > existing.latest_at) {
          existing.latest_error = entry.error_message as string
          existing.latest_at = entry.created_at as string
        }
      }
    }

    const error_summary: ErrorEntry[] = Array.from(errorByType.entries())
      .map(([agent_type, info]) => ({
        agent_type,
        count: info.count,
        latest_error: info.latest_error,
        latest_at: info.latest_at,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // ── 5. Token spend by org ────────────────────────────────────────────
    const spendRuns = tokenSpendResult.data ?? []
    const spendByOrg = new Map<string, { total_tokens: number; total_cost: number }>()

    for (const run of spendRuns) {
      const orgId = run.org_id as string
      const existing = spendByOrg.get(orgId) ?? { total_tokens: 0, total_cost: 0 }
      existing.total_tokens += ((run.tokens_in as number) ?? 0) + ((run.tokens_out as number) ?? 0)
      existing.total_cost += (run.cost_estimate as number) ?? 0
      spendByOrg.set(orgId, existing)
    }

    const token_spend: TokenSpendEntry[] = Array.from(spendByOrg.entries())
      .map(([org_id, info]) => ({
        org_id,
        org_name: org_id.slice(0, 8), // Short ID, real name would require join
        total_tokens_24h: info.total_tokens,
        total_cost_24h: Math.round(info.total_cost * 10000) / 10000,
      }))
      .sort((a, b) => b.total_cost_24h - a.total_cost_24h)

    // ── Response ─────────────────────────────────────────────────────────
    const response: MonitoringResponse = {
      cron_stats,
      agent_latency,
      channel_health,
      error_summary,
      token_spend,
      generated_at: now.toISOString(),
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'max-age=30',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[admin/monitoring] Failed to generate monitoring data', { error: message })
    return NextResponse.json({ error: 'Failed to generate monitoring data' }, { status: 500 })
  }
}
