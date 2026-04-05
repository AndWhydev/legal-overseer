import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/[id]/test
 * Test a connection by inserting and immediately deleting a test message.
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

  const start = Date.now()

  // Insert a test message
  const testExternalId = `_test_${Date.now()}`
  const { data: inserted, error: insertErr } = await supabase
    .from('channel_messages')
    .insert({
      org_id: orgId,
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
  await supabase.from('channel_messages').delete().eq('id', inserted.id)

  const durationMs = Date.now() - start

  // Log success
  await supabase.from('connection_sync_logs').insert({
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
