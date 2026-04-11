import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

interface OrgMetrics {
  org_id: string
  org_name: string
  created_at: string
  plan: string
  active_days_7d: number
  total_messages_7d: number
  total_agent_runs_7d: number
  total_tokens_7d: number
  total_cost_7d: number
  error_count_7d: number
  feedback_count: number
  last_active: string | null
}

/**
 * GET /api/admin/beta-metrics
 *
 * Returns per-org metrics for all beta organizations:
 * - Active days (7d)
 * - Messages sent (7d)
 * - Agent runs (7d)
 * - Token usage (7d)
 * - Error count (7d)
 * - Feedback submissions
 *
 * Auth: Admin only
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Verify admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Fetch all orgs
    const { data: orgs, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, created_at, plan')
      .order('created_at', { ascending: false })
      .limit(100)

    if (orgErr || !orgs) {
      logger.error('[beta-metrics] Failed to fetch orgs', { error: orgErr?.message })
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })
    }

    const orgIds = orgs.map(o => o.id)

    // Run all metrics queries in parallel
    const [
      agentRunsResult,
      messagesResult,
      feedbackResult,
    ] = await Promise.all([
      // Agent runs in last 7 days
      supabase
        .from('agent_runs')
        .select('org_id, status, tokens_in, tokens_out, cost_estimate, created_at')
        .in('org_id', orgIds)
        .gte('created_at', sevenDaysAgo),

      // Channel messages in last 7 days
      supabase
        .from('channel_messages')
        .select('org_id, created_at')
        .in('org_id', orgIds)
        .gte('created_at', sevenDaysAgo),

      // Feedback count per org (all time)
      supabase
        .from('beta_feedback')
        .select('org_id')
        .in('org_id', orgIds),
    ])

    const agentRuns = agentRunsResult.data ?? []
    const messages = messagesResult.data ?? []
    const feedback = feedbackResult.data ?? []

    // Aggregate per org
    const metricsMap = new Map<string, {
      runs: number
      tokens: number
      cost: number
      errors: number
      messages: number
      feedback: number
      activeDays: Set<string>
      lastActive: string | null
    }>()

    // Initialize all orgs
    for (const org of orgs) {
      metricsMap.set(org.id, {
        runs: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        messages: 0,
        feedback: 0,
        activeDays: new Set(),
        lastActive: null,
      })
    }

    // Agent runs
    for (const run of agentRuns) {
      const m = metricsMap.get(run.org_id as string)
      if (!m) continue
      m.runs++
      m.tokens += ((run.tokens_in as number) ?? 0) + ((run.tokens_out as number) ?? 0)
      m.cost += (run.cost_estimate as number) ?? 0
      if (run.status === 'error') m.errors++
      const day = (run.created_at as string).slice(0, 10)
      m.activeDays.add(day)
      if (!m.lastActive || (run.created_at as string) > m.lastActive) {
        m.lastActive = run.created_at as string
      }
    }

    // Messages
    for (const msg of messages) {
      const m = metricsMap.get(msg.org_id as string)
      if (!m) continue
      m.messages++
      const day = (msg.created_at as string).slice(0, 10)
      m.activeDays.add(day)
      if (!m.lastActive || (msg.created_at as string) > m.lastActive) {
        m.lastActive = msg.created_at as string
      }
    }

    // Feedback
    for (const fb of feedback) {
      const m = metricsMap.get(fb.org_id as string)
      if (!m) continue
      m.feedback++
    }

    // Build response
    const metrics: OrgMetrics[] = orgs.map(org => {
      const m = metricsMap.get(org.id)!
      return {
        org_id: org.id,
        org_name: org.name ?? org.id.slice(0, 8),
        created_at: org.created_at,
        plan: org.plan ?? 'free',
        active_days_7d: m.activeDays.size,
        total_messages_7d: m.messages,
        total_agent_runs_7d: m.runs,
        total_tokens_7d: m.tokens,
        total_cost_7d: Math.round(m.cost * 10000) / 10000,
        error_count_7d: m.errors,
        feedback_count: m.feedback,
        last_active: m.lastActive,
      }
    })

    // Sort by activity (most active first)
    metrics.sort((a, b) => b.total_agent_runs_7d - a.total_agent_runs_7d)

    // Summary stats
    const summary = {
      total_orgs: metrics.length,
      active_orgs_7d: metrics.filter(m => m.active_days_7d > 0).length,
      total_agent_runs_7d: metrics.reduce((s, m) => s + m.total_agent_runs_7d, 0),
      total_messages_7d: metrics.reduce((s, m) => s + m.total_messages_7d, 0),
      total_cost_7d: Math.round(metrics.reduce((s, m) => s + m.total_cost_7d, 0) * 10000) / 10000,
      total_errors_7d: metrics.reduce((s, m) => s + m.error_count_7d, 0),
      total_feedback: metrics.reduce((s, m) => s + m.feedback_count, 0),
    }

    return NextResponse.json({ metrics, summary, generated_at: now.toISOString() }, {
      headers: { 'Cache-Control': 'max-age=60' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[beta-metrics] Failed to generate metrics', { error: message })
    return NextResponse.json({ error: 'Failed to generate metrics' }, { status: 500 })
  }
}
