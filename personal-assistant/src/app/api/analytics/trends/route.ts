import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { analyseTrend } from '@/lib/analytics/forecasting'
import type { TrendSeries } from '@/lib/analytics/forecasting'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnomalySummary {
  metric: string
  date: string
  value: number
  zScore: number
  deviation: number
}

export interface TrendsResponse {
  messageVolume: TrendSeries
  taskCompletionRate: TrendSeries
  agentInvocations: TrendSeries
  anomalies: AnomalySummary[]
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateBuckets(
  rows: Array<{ date_bucket: string; count: number }>,
  days = 30,
): Array<{ date: string; value: number }> {
  // Build a dense date-keyed map from the last N days
  const map = new Map<string, number>()
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    map.set(d.toISOString().slice(0, 10), 0)
  }

  for (const row of rows) {
    const key = row.date_bucket?.slice(0, 10)
    if (key && map.has(key)) {
      map.set(key, row.count)
    }
  }

  return Array.from(map.entries()).map(([date, value]) => ({ date, value }))
}

// ---------------------------------------------------------------------------
// GET /api/analytics/trends
// ---------------------------------------------------------------------------

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const orgId = await getActiveOrgId(client, user.id)

    const DAYS = 30
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - DAYS)
    const sinceStr = since.toISOString()

    // Fetch raw message data grouped by day
    const { data: msgRows } = await client
      .from('channel_messages')
      .select('created_at')
      .eq('org_id', orgId)
      .gte('created_at', sinceStr)

    // Fetch raw task completions grouped by day
    const { data: taskRows } = await client
      .from('tasks')
      .select('updated_at, status')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .gte('updated_at', sinceStr)

    // Fetch agent sessions grouped by day (using agent_sessions as proxy for invocations)
    const { data: agentRows } = await client
      .from('agent_sessions')
      .select('created_at')
      .eq('org_id', orgId)
      .gte('created_at', sinceStr)

    // Aggregate raw rows into daily bucket maps
    const msgBuckets = new Map<string, number>()
    for (const row of msgRows ?? []) {
      const key = (row.created_at as string).slice(0, 10)
      msgBuckets.set(key, (msgBuckets.get(key) ?? 0) + 1)
    }

    const taskBuckets = new Map<string, number>()
    for (const row of taskRows ?? []) {
      const key = (row.updated_at as string).slice(0, 10)
      taskBuckets.set(key, (taskBuckets.get(key) ?? 0) + 1)
    }

    const agentBuckets = new Map<string, number>()
    for (const row of agentRows ?? []) {
      const key = (row.created_at as string).slice(0, 10)
      agentBuckets.set(key, (agentBuckets.get(key) ?? 0) + 1)
    }

    // Convert to dense time series (fill 0s for missing days)
    const msgSeries = toDateBuckets(
      Array.from(msgBuckets.entries()).map(([date_bucket, count]) => ({ date_bucket, count })),
      DAYS,
    )
    const taskSeries = toDateBuckets(
      Array.from(taskBuckets.entries()).map(([date_bucket, count]) => ({ date_bucket, count })),
      DAYS,
    )
    const agentSeries = toDateBuckets(
      Array.from(agentBuckets.entries()).map(([date_bucket, count]) => ({ date_bucket, count })),
      DAYS,
    )

    const msgTrend = analyseTrend(msgSeries, 7)
    const taskTrend = analyseTrend(taskSeries, 7)
    const agentTrend = analyseTrend(agentSeries, 7)

    // Collect anomalies across all metrics for a cross-metric digest
    const anomalies: AnomalySummary[] = [
      ...msgTrend.anomalies
        .filter((p) => p.isAnomaly)
        .map((p) => ({ metric: 'messageVolume', date: p.date, value: p.value, zScore: p.zScore, deviation: p.deviation })),
      ...taskTrend.anomalies
        .filter((p) => p.isAnomaly)
        .map((p) => ({ metric: 'taskCompletionRate', date: p.date, value: p.value, zScore: p.zScore, deviation: p.deviation })),
      ...agentTrend.anomalies
        .filter((p) => p.isAnomaly)
        .map((p) => ({ metric: 'agentInvocations', date: p.date, value: p.value, zScore: p.zScore, deviation: p.deviation })),
    ].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

    const response: TrendsResponse = {
      messageVolume: msgTrend,
      taskCompletionRate: taskTrend,
      agentInvocations: agentTrend,
      anomalies,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (err) {
    logger.error('[analytics/trends] error:', err)
    return NextResponse.json(
      { error: 'Trends query failed', details: String(err) },
      { status: 500 },
    )
  }
}
