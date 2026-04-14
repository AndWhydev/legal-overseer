/**
 * POST /api/voice/session
 *
 * Mints a short-lived JWT the client presents when connecting to
 * `/api/voice/stream`. This separates auth (cookie/Bearer) from the data
 * channel (which will be a WebSocket in Phase 2 — WS upgrades don't
 * play well with cookie auth across all hosts). The Phase-1 SSE transport
 * also uses it so the client/server contract is stable.
 *
 * Auth pattern mirrors `/api/voice/synthesize/route.ts`:
 *   dev bypass → Bearer → cookie.
 */

import { NextRequest } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { signVoiceSessionToken, SESSION_TTL_SECONDS } from '@/lib/voice/session-token'
import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'

const DEV_BYPASS_USER_ID = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
const DEV_BYPASS_ORG_ID = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'

// ─── Route handler ───────────────────────────────────────────────────────

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request: NextRequest) {
  // Body may carry { threadId?: string } to resume a specific conversation
  let body: { threadId?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine
  }

  // ── Authentication ───────────────────────────────────────────────────
  let userId: string
  let orgId: string
  let email: string | undefined
  let displayName: string | undefined

  if (isDevBypass()) {
    userId = DEV_BYPASS_USER_ID
    orgId = DEV_BYPASS_ORG_ID
    email = 'hi@torkay.com'
    displayName = 'Tor'
    logger.warn('[voice/session] Using dev bypass auth')
  } else {
    let bearerAuth: Awaited<ReturnType<typeof authenticateBearer>> = null
    try {
      bearerAuth = await authenticateBearer(request)
    } catch (err) {
      if (err instanceof Response) return err
      return jsonError('Unauthorized', 401)
    }

    if (bearerAuth) {
      userId = bearerAuth.user.id
      orgId = bearerAuth.orgId
      email = bearerAuth.user.email
      displayName = bearerAuth.displayName
    } else {
      const client = await createClient()
      if (!client) return jsonError('Auth not configured', 503)

      const { data: { user } } = await client.auth.getUser()
      if (!user) return jsonError('Unauthorized', 401)

      const { data: profile } = await client
        .from('profiles')
        .select('org_id, display_name')
        .eq('id', user.id)
        .single()

      if (!profile) return jsonError('No profile found', 400)

      userId = user.id
      orgId = profile.org_id as string
      email = user.email ?? undefined
      displayName = (profile.display_name as string | undefined)
        || user.user_metadata?.display_name
        || user.email?.split('@')[0]
        || undefined
    }
  }

  // ── Rate limit ───────────────────────────────────────────────────────
  const rateLimited = checkUserEndpointLimit(userId, '/api/voice/session')
  if (rateLimited) return rateLimited

  // ── Validate optional threadId ───────────────────────────────────────
  let threadId: string | undefined
  const rawThread = typeof body.threadId === 'string' && body.threadId.length <= 128
    ? body.threadId
    : undefined

  if (rawThread) {
    const svc = getServiceClient()
    const { data: thread } = await svc
      .from('conversation_threads')
      .select('id')
      .eq('id', rawThread)
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (thread) {
      threadId = rawThread
    } else {
      logger.warn('[voice/session] threadId ownership check failed', { userId, threadId: rawThread })
      // Omit the thread from the token — don't fail the request
    }
  }

  // ── Mint token ───────────────────────────────────────────────────────
  let token: string
  try {
    token = signVoiceSessionToken({ sub: userId, org: orgId, email, name: displayName, thread: threadId })
  } catch (err) {
    logger.error('[voice/session] Token signing failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return jsonError('Voice service misconfigured', 503)
  }

  return new Response(
    JSON.stringify({
      token,
      expiresIn: SESSION_TTL_SECONDS,
      voiceId: process.env.ELEVENLABS_VOICE_ID || null,
      audioFormat: 'mp3_44100_128',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  )
}
