import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
const WORKER_AUTH = process.env.WORKER_AUTH_TOKEN || ''

export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return new Response(JSON.stringify({ error: 'No org found' }), { status: 400 })
  }

  logger.info('[api/onboarding/conversation] Starting SSE proxy', {
    userId: user.id,
    orgId: profile.org_id,
  })

  try {
    const workerRes = await fetch(`${WORKER_URL}/api/onboarding/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WORKER_AUTH}`,
      },
      body: JSON.stringify({
        userId: user.id,
        orgId: profile.org_id,
      }),
    })

    if (!workerRes.ok || !workerRes.body) {
      const text = await workerRes.text()
      logger.error('[api/onboarding/conversation] Worker error', { status: workerRes.status, text })
      return new Response(JSON.stringify({ error: 'Worker unavailable' }), { status: 502 })
    }

    return new Response(workerRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/onboarding/conversation] Proxy failed', { error })
    return new Response(JSON.stringify({ error }), { status: 500 })
  }
}
