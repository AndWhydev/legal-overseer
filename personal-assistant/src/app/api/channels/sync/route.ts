import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { synthesize } from '@/lib/channels/synthesizer'
import type { ChannelType } from '@/lib/channels/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const channels = (body.channels || ['gmail', 'outlook', 'imessage', 'calendar', 'reminders']) as ChannelType[]
    const since = body.since ? new Date(body.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Get active org from user session; allow override via POST body
    const userOrgId = await getActiveOrgId(supabase, user.id)
    const orgId = body.orgId || userOrgId

    const results = await synthesize({ channels, since, orgId })

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
