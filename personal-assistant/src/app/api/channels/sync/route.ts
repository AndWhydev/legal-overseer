import { NextRequest, NextResponse } from 'next/server'
import { synthesize } from '@/lib/channels/synthesizer'
import type { ChannelType } from '@/lib/channels/types'
// Default org for single-user setup. Override via POST body { orgId: "..." }
const DEFAULT_ORG_ID = '289083e9-2143-44eb-9b6a-cfc615f1e81c'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const channels = (body.channels || ['gmail', 'outlook', 'imessage', 'calendar', 'reminders']) as ChannelType[]
    const since = body.since ? new Date(body.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const orgId = body.orgId || DEFAULT_ORG_ID

    const results = await synthesize({ channels, since, orgId })

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
