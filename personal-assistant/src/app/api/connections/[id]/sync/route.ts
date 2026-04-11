import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/connections/[id]/sync
 * Manually trigger a sync for a poll-based connection.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conn } = await ctx.supabase
    .from('org_connections')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
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

  const result = await pollChannel(ctx.supabase, ctx.orgId, conn.provider as any)

  logger.info(
    `[manual-sync] connection=${id} found=${result.messagesFound} inserted=${result.messagesInserted}`
  )

  return NextResponse.json({
    ok: true,
    messagesFound: result.messagesFound,
    messagesInserted: result.messagesInserted,
  })
}
