/**
 * POST /api/voice/stream
 *
 * Voice turn endpoint. Accepts a recorded audio clip and streams back the
 * full voice-turn event protocol (transcript, TAOR agent events, TTS audio)
 * as Server-Sent Events.
 *
 * Transport: SSE for Phase 1. The event shape is transport-agnostic — a
 * Phase-2 WebSocket variant will emit the same `VoiceEvent` objects (binary
 * frames instead of base64-in-JSON for audio).
 *
 * Auth: the caller presents a JWT minted by `/api/voice/session` via
 *   - `Authorization: Bearer <token>` header, OR
 *   - a `token` form field (easier for browser `fetch` with multipart body)
 *
 * Request (multipart/form-data):
 *   - audio: File        — the recorded clip (MediaRecorder WebM/Opus)
 *   - token: string      — optional if Authorization header is present
 *
 * Response (text/event-stream): one JSON-encoded VoiceEvent per SSE frame.
 */

import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { runVoiceTurn, type VoiceEvent } from '@/lib/voice/session'
import { verifyVoiceSessionToken } from '@/lib/voice/session-token'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20 MB cap per turn

function sseEvent(ev: VoiceEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

function sseError(message: string, status: number): Response {
  // If we haven't started streaming yet, return a plain JSON error — clients
  // check response.ok before reading the SSE stream.
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request: NextRequest) {
  // ── Parse multipart body ─────────────────────────────────────────────
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return sseError('Expected multipart/form-data', 400)
  }

  const audioFile = form.get('audio')
  if (!audioFile || !(audioFile instanceof Blob)) {
    return sseError('audio field is required', 400)
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return sseError('Audio too large', 413)
  }
  if (audioFile.size === 0) {
    return sseError('Audio is empty', 400)
  }

  // ── Extract voice-session token ──────────────────────────────────────
  let token: string | null = null
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim()
  } else {
    const formToken = form.get('token')
    if (typeof formToken === 'string') token = formToken
  }

  if (!token) {
    return sseError('Missing voice session token', 401)
  }

  let claims: ReturnType<typeof verifyVoiceSessionToken>
  try {
    claims = verifyVoiceSessionToken(token)
  } catch (err) {
    logger.error('[voice/stream] Token verification threw', {
      error: err instanceof Error ? err.message : String(err),
    })
    return sseError('Voice service misconfigured', 503)
  }
  if (!claims) {
    return sseError('Invalid or expired voice session token', 401)
  }

  // ── Rate limit ───────────────────────────────────────────────────────
  const rateLimited = checkUserEndpointLimit(claims.sub, '/api/voice/stream')
  if (rateLimited) return rateLimited

  // ── Resolve threadId ─────────────────────────────────────────────────
  const formThread = form.get('threadId')
  const threadId =
    (typeof formThread === 'string' && formThread.length > 0 && formThread.length <= 128
      ? formThread
      : undefined) ?? claims.thread

  // ── Build supabase client (service role — we've already authed) ──────
  const supabase = getServiceClient()

  // ── Wire an abort signal to the client disconnect ────────────────────
  const abortController = new AbortController()
  request.signal.addEventListener('abort', () => abortController.abort(), { once: true })

  // ── Build the SSE stream ─────────────────────────────────────────────
  const encoder = new TextEncoder()

  // Proxies (Vercel, Cloudflare, nginx) drop "idle" HTTP connections after
  // 30-60s. TAOR tool execution can legitimately block longer than that, so
  // we emit an SSE comment frame every 15s — valid SSE syntax, ignored by
  // the browser EventSource parser, keeps the socket warm.
  const KEEPALIVE_MS = 15_000

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null

      function write(payload: string) {
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          // Stream already closed (client disconnect) — ignore.
        }
      }
      function writeEvent(ev: VoiceEvent) {
        write(sseEvent(ev))
      }

      keepaliveTimer = setInterval(() => {
        // SSE comments: any line beginning with `:` is a no-op heartbeat.
        write(`: ka ${Date.now()}\n\n`)
      }, KEEPALIVE_MS)

      try {
        const events = runVoiceTurn({
          supabase,
          identity: {
            userId: claims!.sub,
            orgId: claims!.org,
            email: claims!.email,
            displayName: claims!.name,
          },
          threadId,
          audioBlob: audioFile as Blob,
          signal: abortController.signal,
        })

        for await (const ev of events) {
          if (abortController.signal.aborted) break
          writeEvent(ev)
        }
      } catch (err) {
        logger.error('[voice/stream] runVoiceTurn failed', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        writeEvent({
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'Voice turn failed' },
        })
      } finally {
        if (keepaliveTimer) clearInterval(keepaliveTimer)
        try {
          controller.close()
        } catch {
          /* noop */
        }
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
