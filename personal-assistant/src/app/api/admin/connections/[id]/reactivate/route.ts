import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import { createConnectorManager } from '@/lib/connectors'
import { logger } from '@/lib/core/logger'
import type { OrgConnection } from '@/lib/connections/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/connections/[id]/reactivate
 *
 * Admin-only escape hatch for connections stuck in 'provisioning' or 'error'.
 * Re-runs the lifecycle's activate() with the full row so the status flips
 * to 'connected' (or surfaces a real error we can diagnose).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 503 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: conn, error } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const accountId =
    (conn.connected_account_id as string | null) ??
    ((conn.config as Record<string, string | undefined> | null)?.composio_connected_account_id ?? null)

  try {
    const manager = createConnectorManager(supabase, { skipBridge: true })
    await manager.activate(conn as OrgConnection, {
      accountId: accountId ?? undefined,
      metadata: {},
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[admin/reactivate] activate() threw', { id, error: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }

  const { data: refreshed } = await supabase
    .from('org_connections')
    .select('id, status, last_error')
    .eq('id', id)
    .maybeSingle()

  return NextResponse.json({ success: true, connection: refreshed })
}

async function requireAdmin(): Promise<NextResponse | void> {
  const userClient = await createClient()
  if (!userClient) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
}
