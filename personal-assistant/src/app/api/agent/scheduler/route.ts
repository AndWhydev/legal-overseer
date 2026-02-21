import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runScheduledAgents } from '@/lib/agent/scheduler'

// Allow up to 60s for Vercel Pro plan
export const maxDuration = 60

/**
 * POST /api/agent/scheduler
 *
 * Trigger a scheduler tick. Checks which agents are due and fires them.
 *
 * Designed to be called by:
 * 1. Vercel Cron -- add to vercel.json:
 *    { "crons": [{ "path": "/api/agent/scheduler", "schedule": "* * * * *" }] }
 *
 * 2. External cron (e.g., Hetzner VPS):
 *    curl -X POST https://bitbit.vercel.app/api/agent/scheduler \
 *      -H "Authorization: Bearer $SCHEDULER_SECRET"
 *
 * The scheduler itself handles per-agent intervals/cron -- the external cron
 * just ticks the scheduler (typically every minute).
 *
 * Body (optional): { orgId?: string }
 * If omitted, checks all orgs.
 *
 * Auth: Bearer token via SCHEDULER_SECRET env var.
 */
export async function POST(request: NextRequest) {
  // Bearer token auth
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.SCHEDULER_SECRET
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service-role Supabase client (created at HTTP boundary per DI pattern)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  let body: { orgId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is valid -- check all orgs
  }

  const results = await runScheduledAgents(supabase, body.orgId)

  return NextResponse.json({
    results,
    triggeredCount: results.filter((r) => r.triggered).length,
    checkedCount: results.length,
  })
}
