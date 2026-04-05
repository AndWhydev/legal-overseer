import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/connections/[id]/sync
 * Manually trigger a sync for a poll-based connection.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: conn } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (conn.transport === 'bridge') {
    return NextResponse.json(
      { error: 'Bridge connections sync externally — no manual sync available.' },
      { status: 400 }
    )
  }

  if (conn.transport === 'webhook') {
    return NextResponse.json(
      { error: 'Webhook connections receive data passively — no manual sync available.' },
      { status: 400 }
    )
  }

  // poll transport — run the channel poller
  const { pollChannel } = await import('@/lib/channels/relay-daemon')

  const result = await pollChannel(supabase, orgId, conn.provider as any)

  logger.info(
    `[manual-sync] connection=${id} found=${result.messagesFound} inserted=${result.messagesInserted}`
  )

  return NextResponse.json({
    ok: true,
    messagesFound: result.messagesFound,
    messagesInserted: result.messagesInserted,
  })
}
