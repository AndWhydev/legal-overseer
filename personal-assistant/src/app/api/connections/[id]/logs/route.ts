import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/[id]/logs
 * Retrieve recent sync events for a connection.
 * Supports ?limit=20&offset=0 pagination.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  // Verify connection belongs to user's org
  const { data: conn } = await supabase
    .from('org_connections')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100)
  const offset = Number(url.searchParams.get('offset') ?? '0')

  const { data: logs, error } = await supabase
    .from('connection_sync_logs')
    .select('*')
    .eq('connection_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: logs ?? [] })
}
