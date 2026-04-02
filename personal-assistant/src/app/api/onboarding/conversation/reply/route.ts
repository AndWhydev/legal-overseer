import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import { NextResponse } from 'next/server'
import { getReplyQueue } from './queue'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No org found' }, { status: 400 })
  }

  const body = await request.json() as { message: string }

  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  logger.info('[api/onboarding/conversation/reply] Queuing user reply', {
    userId: user.id,
    orgId: profile.org_id,
  })

  const queue = getReplyQueue(profile.org_id)
  queue.push({ message: body.message, timestamp: Date.now() })

  return NextResponse.json({ ok: true })
}
