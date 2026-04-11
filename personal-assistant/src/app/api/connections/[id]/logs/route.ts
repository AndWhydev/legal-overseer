import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/[id]/logs
 * Retrieve recent sync events for a connection.
 * Supports ?limit=20&offset=0 pagination.
 */
export async function GET(
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

  // Verify connection belongs to user's org
  const { data: conn } = await ctx.supabase
    .from('org_connections')
    .select('id')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '20'), 100)
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0')

  const { data: logs, error } = await ctx.supabase
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
