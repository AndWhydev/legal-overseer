import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import {
  VpsPool,
  createImessageProvisioner,
  isImessageVpsConfigured,
} from '@/lib/bridges'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'
// macOS boot + SSH + BlueBubbles install can legitimately take a few minutes.
export const maxDuration = 300

/**
 * GET /api/admin/bridge-pool/seed
 *
 * Admin-only pool status check. Returns current warm count, in-flight
 * provisioning count, deficit vs target, and whether the VPS client is
 * configured.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 503 })
  }

  const supabase = getServiceClient()
  const pool = new VpsPool(supabase)
  const [warm, provisioning, deficit] = await Promise.all([
    pool.getPoolCount(),
    pool.getProvisioningCount(),
    pool.getDeficit(),
  ])

  return NextResponse.json({
    warm,
    provisioning,
    deficit,
    vpsConfigured: isImessageVpsConfigured(),
  })
}

/**
 * POST /api/admin/bridge-pool/seed
 *
 * Triggers pool replenishment immediately instead of waiting for the
 * 15-minute cron. Same code path as /api/cron/bridge-pool — this just
 * lets an operator unblock a stuck user without waiting.
 *
 * Returns the ReplenishResult: { requested, provisioned, failed, errors }.
 */
export async function POST() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!isImessageVpsConfigured()) {
    return NextResponse.json(
      {
        error: 'IMESSAGE_VPS_* env vars are not configured. Cannot provision new instances.',
      },
      { status: 503 },
    )
  }

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 503 })
  }

  const supabase = getServiceClient()
  const provisioner = createImessageProvisioner(supabase)

  try {
    const result = await provisioner.replenishPool()
    logger.info('[admin/bridge-pool/seed] Manual replenish triggered', result)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[admin/bridge-pool/seed] Replenish failed', { error: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<NextResponse | void> {
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
}
