import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import { runAllSmokeTests, runChannelSmoke } from '@/lib/channels/smoke-test-runner'
import type { ChannelType } from '@/lib/channels/types'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---------------------------------------------------------------------------
// POST /api/admin/smoke-test
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
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
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 503 })
  }

  const serviceClient = getServiceClient()
  const orgId = profile.org_id as string

  try {
    // Parse optional channel filter from body
    let body: { channel?: ChannelType } = {}
    try {
      body = await request.json()
    } catch {
      // No body or invalid JSON -- run all tests
    }

    if (body.channel) {
      // Run single channel smoke test
      logger.info(`[admin/smoke-test] Running smoke test for ${body.channel}`)
      const result = await runChannelSmoke(body.channel, serviceClient, orgId)
      return NextResponse.json({
        overall: result.status === 'pass' ? 'pass' : 'fail',
        channels: [result],
        duration_ms: result.latencyMs,
        testedAt: result.testedAt,
      })
    }

    // Run all smoke tests
    logger.info('[admin/smoke-test] Running all channel smoke tests')
    const report = await runAllSmokeTests(serviceClient, orgId)

    return NextResponse.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[admin/smoke-test] Smoke test failed', { error: message })
    return NextResponse.json({ error: 'Smoke test failed', detail: message }, { status: 500 })
  }
}
