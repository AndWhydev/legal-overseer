import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMonitoringReport } from '@/lib/rag/monitor'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/rag/monitor
 * Returns Pinecone index monitoring report: stats, cost estimates, and alerts.
 *
 * Returns:
 * {
 *   stats: {
 *     totalVectors: number,
 *     namespaceVectors: { [orgId]: count },
 *     indexFullness: number,
 *     indexCapacity: number,
 *     timestamp: ISO string
 *   },
 *   costs: {
 *     monthlyCost: number,
 *     storageCost: number,
 *     queryCost: number,
 *     metadataCost: number,
 *     costPer1MVectors: number
 *   },
 *   alerts: [
 *     {
 *       level: 'critical' | 'warning' | 'info',
 *       message: string,
 *       metric: string,
 *       currentValue: number,
 *       threshold?: number
 *     }
 *   ]
 * }
 *
 * On error or Pinecone not configured: gracefully returns null stats with empty alerts
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({
      stats: null,
      costs: null,
      alerts: [],
    })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await getMonitoringReport()
    return NextResponse.json(report)
  } catch (err) {
    logger.error('[rag-monitor] Failed to generate monitoring report', {
      error: err instanceof Error ? err.message : String(err),
    })

    // Graceful degradation
    return NextResponse.json({
      stats: null,
      costs: null,
      alerts: [],
    })
  }
}

/**
 * POST /api/rag/monitor
 * (Optional) Save daily stats snapshot to service_metrics table for trend tracking.
 * Enables historical analysis of vector count growth and cost trends.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get org_id from user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.org_id) {
      logger.warn('[rag-monitor] Failed to get org_id for snapshot', { error: profileError })
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    }

    const report = await getMonitoringReport()

    if (!report.stats || !report.costs) {
      return NextResponse.json({ error: 'Monitoring data unavailable' }, { status: 503 })
    }

    // Save daily snapshot to service_metrics table
    // Format: { type: 'rag_index', org_id, vectors, fullness, monthly_cost, ... }
    const snapshot = {
      type: 'rag_index',
      org_id: profile.org_id,
      vectors: report.stats.totalVectors,
      fullness_percent: report.stats.indexFullness,
      monthly_cost: report.costs.monthlyCost,
      storage_cost: report.costs.storageCost,
      query_cost: report.costs.queryCost,
      metadata_cost: report.costs.metadataCost,
      timestamp: report.stats.timestamp,
      namespaces: report.stats.namespaceVectors,
      alert_count: report.alerts.length,
      critical_alerts: report.alerts.filter(a => a.level === 'critical').length,
    }

    const { error: insertError } = await supabase
      .from('service_metrics')
      .insert({
        org_id: profile.org_id,
        metric_name: 'rag_index_monitor',
        metric_value: snapshot,
        recorded_at: new Date().toISOString(),
      })

    if (insertError) {
      logger.warn('[rag-monitor] Failed to save snapshot to service_metrics', {
        error: insertError,
      })
      // Still return the report even if snapshot save fails
    }

    return NextResponse.json({
      ...report,
      snapshotSaved: !insertError,
    })
  } catch (err) {
    logger.error('[rag-monitor] Failed to save monitoring snapshot', {
      error: err instanceof Error ? err.message : String(err),
    })

    return NextResponse.json(
      { error: 'Failed to save snapshot' },
      { status: 500 }
    )
  }
}
