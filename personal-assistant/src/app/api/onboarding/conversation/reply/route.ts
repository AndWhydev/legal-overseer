import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
const WORKER_AUTH = process.env.WORKER_AUTH_TOKEN || ''

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { message: string }

  logger.info('[api/onboarding/conversation/reply] Forwarding reply to worker', {
    userId: user.id,
  })

  try {
    const workerRes = await fetch(`${WORKER_URL}/api/onboarding/conversation/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WORKER_AUTH}`,
      },
      body: JSON.stringify({ message: body.message }),
    })

    if (!workerRes.ok) {
      const text = await workerRes.text()
      logger.error('[api/onboarding/conversation/reply] Worker error', { status: workerRes.status, text })
      return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/onboarding/conversation/reply] Proxy failed', { error })
    return NextResponse.json({ error }, { status: 500 })
  }
}
