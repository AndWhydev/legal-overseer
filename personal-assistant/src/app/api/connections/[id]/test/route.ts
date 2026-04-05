import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/[id]/test
 * Test a connection by inserting and immediately deleting a test message.
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

  const start = Date.now()

  // Insert a test message
  const testExternalId = `_test_${Date.now()}`
  const { data: inserted, error: insertErr } = await ctx.supabase
    .from('channel_messages')
    .insert({
      org_id: ctx.orgId,
      channel: conn.provider,
      external_id: testExternalId,
      sender: 'Connection Test',
      body: 'This is an automated connection test message.',
      received_at: new Date().toISOString(),
      is_actionable: false,
      priority: 'low',
      processed: true,
      metadata: { _test: true, _connection_id: id },
      content_hash: `test-${testExternalId}`,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: `Test failed: ${insertErr?.message ?? 'insert failed'}` }, { status: 500 })
  }

  // Delete the test message
  await ctx.supabase.from('channel_messages').delete().eq('id', inserted.id)

  const durationMs = Date.now() - start

  // Log success
  await ctx.supabase.from('connection_sync_logs').insert({
    connection_id: id,
    status: 'success',
    messages_found: 1,
    messages_inserted: 0,
    duplicates: 0,
    error_message: null,
    duration_ms: durationMs,
  })

  logger.info(`[connection-test] connection=${id} ok in ${durationMs}ms`)

  return NextResponse.json({ ok: true, message: 'Connection test passed', duration_ms: durationMs })
}
