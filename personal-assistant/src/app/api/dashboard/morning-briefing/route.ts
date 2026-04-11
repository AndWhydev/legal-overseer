import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

const EMPTY_BRIEFING = {
  urgent: [],
  followUps: [],
  discoveries: [],
  pendingApprovals: 0,
  generatedAt: null,
  stale: true,
}

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const { data: org, error } = await supabase
      .from('organisations')
      .select('settings')
      .eq('id', orgId)
      .single()

    if (error || !org) {
      logger.warn('Morning briefing: no org found', { orgId, error })
      return NextResponse.json(EMPTY_BRIEFING)
    }

    const briefing = org.settings?.morning_briefing
    if (!briefing) {
      return NextResponse.json(EMPTY_BRIEFING)
    }

    const generatedAt = briefing.generatedAt ? new Date(briefing.generatedAt) : null
    const now = new Date()
    const stale = !generatedAt || (now.getTime() - generatedAt.getTime()) > 24 * 60 * 60 * 1000

    return NextResponse.json({
      urgent: briefing.urgent ?? [],
      followUps: briefing.followUps ?? [],
      discoveries: briefing.discoveries ?? [],
      pendingApprovals: briefing.pendingApprovals ?? 0,
      generatedAt: briefing.generatedAt ?? null,
      stale,
    })
  } catch (error) {
    logger.error('Morning briefing error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch morning briefing' },
      { status: 500 }
    )
  }
}
