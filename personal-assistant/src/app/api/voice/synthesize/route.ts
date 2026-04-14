/**
 * POST /api/voice/synthesize
 *
 * Converts text to speech audio using OpenAI TTS via Vercel AI Gateway.
 *
 * Body: { text: string, voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" }
 * Response: audio/mpeg stream
 *
 * Uses ANTHROPIC_BASE_URL (AI Gateway) which routes to OpenAI TTS.
 */

import { NextRequest } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { getOpenAIEndpoint } from '@/lib/ai/openai-gateway'
import { logger } from '@/lib/core/logger'

const MAX_TEXT_LENGTH = 4096
const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
type Voice = (typeof VALID_VOICES)[number]
const DEFAULT_VOICE: Voice = 'nova'

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────
  let body: { text?: unknown; voice?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const { text, voice: rawVoice } = body

  // ── Validate text ───────────────────────────────────────────────────
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return jsonError('Text is required', 400)
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonError(`Text too long (max ${MAX_TEXT_LENGTH} characters)`, 400)
  }

  // ── Validate voice ──────────────────────────────────────────────────
  const voice: Voice = rawVoice ? (rawVoice as Voice) : DEFAULT_VOICE
  if (rawVoice && !VALID_VOICES.includes(voice)) {
    return jsonError(
      `Invalid voice. Must be one of: ${VALID_VOICES.join(', ')}`,
      400,
    )
  }

  // ── Authentication ──────────────────────────────────────────────────
  let userId: string

  if (isDevBypass()) {
    userId = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
    logger.warn('[voice/synthesize] Using dev bypass auth')
  } else {
    // Try Bearer token first (mobile), then cookie auth (web)
    let bearerAuth: Awaited<ReturnType<typeof authenticateBearer>> = null
    try {
      bearerAuth = await authenticateBearer(request)
    } catch (err) {
      if (err instanceof Response) return err
      return jsonError('Unauthorized', 401)
    }

    if (bearerAuth) {
      userId = bearerAuth.user.id
    } else {
      const client = await createClient()
      if (!client) {
        return jsonError('Auth not configured', 503)
      }

      const {
        data: { user },
      } = await client.auth.getUser()
      if (!user) {
        return jsonError('Unauthorized', 401)
      }
      userId = user.id
    }
  }

  // ── Rate limit ──────────────────────────────────────────────────────
  const rateLimited = checkUserEndpointLimit(userId, '/api/ai/voice')
  if (rateLimited) return rateLimited

  // ── Call OpenAI TTS via gateway ───────────────────────────────────────
  const openaiEndpoint = getOpenAIEndpoint()
  if (!openaiEndpoint) {
    return jsonError('Neither AI_GATEWAY_API_KEY nor OPENAI_API_KEY configured for TTS', 503)
  }

  try {
    const ttsResponse = await fetch(`${openaiEndpoint.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: openaiEndpoint.authorization,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    })

    if (!ttsResponse.ok) {
      const errorBody = await ttsResponse.text().catch(() => 'Unknown error')
      logger.error('[voice/synthesize] TTS API error', {
        status: ttsResponse.status,
        body: errorBody,
      })
      return jsonError('TTS generation failed', 502)
    }

    // Stream the audio back to the client
    return new Response(ttsResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    logger.error('[voice/synthesize] TTS request failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return jsonError('TTS service unavailable', 503)
  }
}
