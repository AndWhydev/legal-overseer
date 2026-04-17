/**
 * POST /api/voice/transcribe
 *
 * Lightweight Whisper transcription endpoint for dictate mode.
 * Accepts an audio blob, returns { text: string }.
 *
 * Auth: cookie-based (web dashboard) or Bearer token (mobile).
 * No voice session token needed — this is a simple stateless call.
 */

import { NextRequest } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { getOpenAIEndpoint } from '@/lib/ai/openai-gateway'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────
  let userId: string

  if (isDevBypass()) {
    userId = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
  } else {
    let bearerAuth: Awaited<ReturnType<typeof authenticateBearer>> = null
    try {
      bearerAuth = await authenticateBearer(request)
    } catch (err) {
      if (err instanceof Response) return err
    }

    if (bearerAuth) {
      userId = bearerAuth.user.id
    } else {
      const client = await createClient()
      if (!client) return jsonError('Not configured', 503)
      const { data: { user } } = await client.auth.getUser()
      if (!user) return jsonError('Unauthorized', 401)
      userId = user.id
    }
  }

  // ── Rate limit ───────────────────────────────────────────────────────
  const rateLimited = checkUserEndpointLimit(userId, '/api/voice/transcribe')
  if (rateLimited) return rateLimited

  // ── Parse audio ──────────────────────────────────────────────────────
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError('Expected multipart/form-data', 400)
  }

  const audioFile = form.get('audio')
  if (!audioFile || !(audioFile instanceof Blob)) {
    return jsonError('audio field is required', 400)
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return jsonError('Audio too large', 413)
  }
  if (audioFile.size === 0) {
    return jsonError('Audio is empty', 400)
  }

  // ── Transcribe via Whisper ───────────────────────────────────────────
  const endpoint = getOpenAIEndpoint()
  if (!endpoint) {
    return jsonError('Voice transcription not configured', 503)
  }

  try {
    const buf = await audioFile.arrayBuffer()
    const whisperForm = new FormData()
    whisperForm.append('file', new Blob([buf], { type: 'audio/webm' }), 'audio.webm')
    whisperForm.append('model', 'whisper-1')

    const res = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: endpoint.authorization },
      body: whisperForm,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('[voice/transcribe] Whisper error', { status: res.status, body: body.slice(0, 300) })
      return jsonError('Transcription failed', 502)
    }

    const data = (await res.json()) as { text?: string }
    return Response.json({ text: (data.text || '').trim() })
  } catch (err) {
    logger.error('[voice/transcribe] Request failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return jsonError('Transcription service unavailable', 502)
  }
}
