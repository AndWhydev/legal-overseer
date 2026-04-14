import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/connections/summary
 *
 * Aggregates connection health for the caller's org so the admin
 * dashboard can render a status histogram, expiring-soon count, and
 * failure leaderboard without shipping the raw row list.
 *
 * Response:
 *   {
 *     by_status:     Record<status, number>,
 *     by_transport:  Record<transport, number>,
 *     expiring_soon: number,   // auth_expires_at < now() + 24h and status=connected
 *     failing_now:   number,   // consecutive_failures >= 3
 *     top_errors:    Array<{ connection_id, provider, last_error, consecutive_failures }>,
 *   }
 */
export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows, error } = await ctx.supabase
    .from('org_connections')
    .select('id, provider, transport, status, auth_expires_at, consecutive_failures, last_error')
    .eq('org_id', ctx.orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byStatus: Record<string, number> = {}
  const byTransport: Record<string, number> = {}
  const soonCutoff = Date.now() + 24 * 60 * 60 * 1000
  let expiringSoon = 0
  let failingNow = 0
  const topErrors: Array<{
    connection_id: string
    provider: string
    last_error: string
    consecutive_failures: number
  }> = []

  for (const row of (rows ?? []) as Array<{
    id: string
    provider: string
    transport: string
    status: string
    auth_expires_at: string | null
    consecutive_failures: number
    last_error: string | null
  }>) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    byTransport[row.transport] = (byTransport[row.transport] ?? 0) + 1

    if (
      row.status === 'connected' &&
      row.auth_expires_at &&
      new Date(row.auth_expires_at).getTime() < soonCutoff
    ) {
      expiringSoon++
    }

    if (row.consecutive_failures >= 3) {
      failingNow++
      topErrors.push({
        connection_id: row.id,
        provider: row.provider,
        last_error: row.last_error ?? 'unknown',
        consecutive_failures: row.consecutive_failures,
      })
    }
  }

  topErrors.sort((a, b) => b.consecutive_failures - a.consecutive_failures)

  return NextResponse.json({
    by_status: byStatus,
    by_transport: byTransport,
    expiring_soon: expiringSoon,
    failing_now: failingNow,
    top_errors: topErrors.slice(0, 10),
    total: rows?.length ?? 0,
  })
}
