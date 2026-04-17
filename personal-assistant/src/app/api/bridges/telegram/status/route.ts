import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

/**
 * POST /api/bridges/telegram/status
 *
 * Mirrors the `/api/bridges/link-status` contract for the telegram pairing
 * flow started by `/api/bridges/telegram/pair`. Returns `linked` once the
 * webhook has consumed the pairing code (status=connected on the row), and
 * `error` if the code has expired or was invalidated.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, status, config, last_error')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .eq('provider', 'telegram')
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  if (conn.status === 'connected') {
    return NextResponse.json({
      status: 'linked',
      linked_at: (conn.config as { linked_at?: string }).linked_at ?? null,
    })
  }

  if (conn.status === 'error') {
    return NextResponse.json({ status: 'error', error: conn.last_error ?? 'Pairing failed' })
  }

  const config = conn.config as { pairing_code_expires_at?: string }
  if (config.pairing_code_expires_at && new Date(config.pairing_code_expires_at) < new Date()) {
    return NextResponse.json({
      status: 'error',
      error: 'Pairing code expired. Refresh to generate a new one.',
    })
  }

  return NextResponse.json({ status: 'waiting' })
}
