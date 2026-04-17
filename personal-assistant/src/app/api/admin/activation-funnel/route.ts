import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

interface SurfaceStats {
  surface: string
  selected: number
  connected: number
  conversion_rate: number
}

interface FunnelResponse {
  window_days: number
  since: string
  per_surface: SurfaceStats[]
  totals: {
    selected: number
    connected: number
    overall_conversion_rate: number
  }
}

/**
 * GET /api/admin/activation-funnel?days=14
 *
 * Returns per-surface conversion funnel: chat_surface_selected → chat_surface_connected.
 * North-star for bridge-first activation — if WhatsApp selects 100 and connects 10,
 * that 10% is the signal something is broken (QR not rendering, Fly Machine
 * stuck provisioning, etc.).
 *
 * Auth: admin role required (matches beta-metrics pattern).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') ?? '14', 10) || 14))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_name, metadata, user_id')
      .in('event_name', ['chat_surface_selected', 'chat_surface_connected'])
      .gte('created_at', since)

    if (error) {
      logger.error('[activation-funnel] query failed', { error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Bucket by surface: we count distinct user_ids per (event, surface) to
    // avoid double-counting repeat selections (user backing out + re-picking).
    const selectedByUserSurface = new Map<string, string>() // key = user_id:surface
    const connectedByUserSurface = new Map<string, string>()

    for (const row of events ?? []) {
      const metadata = row.metadata as { surface?: string } | null
      const surface = metadata?.surface ?? 'unknown'
      const userId = row.user_id ?? 'anonymous'
      const key = `${userId}:${surface}`
      if (row.event_name === 'chat_surface_selected') {
        selectedByUserSurface.set(key, surface)
      } else if (row.event_name === 'chat_surface_connected') {
        connectedByUserSurface.set(key, surface)
      }
    }

    const surfaceCounts: Record<string, { selected: number; connected: number }> = {}
    for (const surface of selectedByUserSurface.values()) {
      surfaceCounts[surface] ??= { selected: 0, connected: 0 }
      surfaceCounts[surface].selected++
    }
    for (const surface of connectedByUserSurface.values()) {
      surfaceCounts[surface] ??= { selected: 0, connected: 0 }
      surfaceCounts[surface].connected++
    }

    const perSurface: SurfaceStats[] = Object.entries(surfaceCounts)
      .map(([surface, { selected, connected }]) => ({
        surface,
        selected,
        connected,
        conversion_rate: selected === 0 ? 0 : Number((connected / selected).toFixed(3)),
      }))
      .sort((a, b) => b.selected - a.selected)

    const totalSelected = perSurface.reduce((s, x) => s + x.selected, 0)
    const totalConnected = perSurface.reduce((s, x) => s + x.connected, 0)

    const response: FunnelResponse = {
      window_days: days,
      since,
      per_surface: perSurface,
      totals: {
        selected: totalSelected,
        connected: totalConnected,
        overall_conversion_rate: totalSelected === 0 ? 0 : Number((totalConnected / totalSelected).toFixed(3)),
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    logger.error('[activation-funnel] unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
