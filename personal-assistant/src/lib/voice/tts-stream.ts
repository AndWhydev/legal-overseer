/**
 * Server-side ElevenLabs streaming TTS.
 *
 * One `synthesize()` call per sentence. Callers issue many in parallel; each
 * returns an async iterable of MP3 audio chunks. The voice session
 * orchestrator is responsible for playing them back in order (see
 * `src/lib/voice/session.ts`).
 *
 * Why ElevenLabs: substantially more natural prosody than OpenAI TTS at
 * conversational speed, matching the "ChatGPT Advanced Voice Mode" UX bar
 * we're targeting. Env is `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`
 * (both already present in `.env.local.example`).
 */

import { logger } from '@/lib/core/logger'
import { stripMarkdownForSpeech } from './sentence-splitter'

/** Default: the Rachel voice (warm, conversational). Overridable per-user in P3. */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const DEFAULT_MODEL = 'eleven_turbo_v2_5'
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

export interface TTSSynthesisOptions {
  voiceId?: string
  /** Optional AbortSignal — aborts the fetch and closes the response body. */
  signal?: AbortSignal
  /** Override model (defaults to `eleven_turbo_v2_5` for lowest latency). */
  model?: string
}

export interface TTSStreamResult {
  /** Audio byte chunks in order (MP3, 44.1 kHz). */
  chunks: AsyncIterable<Uint8Array>
  /** MIME type of the stream. */
  contentType: string
}

/**
 * Issues a streaming TTS request to ElevenLabs. Returns an async iterable
 * over the response body chunks. The caller is expected to either relay
 * these to the browser (server-sent-events, websocket) or store them.
 */
export async function synthesizeSentence(
  text: string,
  options: TTSSynthesisOptions = {},
): Promise<TTSStreamResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured')
  }

  const voiceId = options.voiceId
    || process.env.ELEVENLABS_VOICE_ID
    || DEFAULT_VOICE_ID
  const model = options.model || DEFAULT_MODEL

  const cleaned = stripMarkdownForSpeech(text)
  if (!cleaned) {
    throw new Error('Empty text after markdown stripping')
  }

  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: cleaned,
      model_id: model,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'unknown error')
    logger.error('[voice/tts] ElevenLabs error', {
      status: response.status,
      body: errBody.slice(0, 500),
    })
    throw new Error(`ElevenLabs TTS failed: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('ElevenLabs returned no response body')
  }

  return {
    chunks: iterateStream(response.body, options.signal),
    contentType: response.headers.get('content-type') || 'audio/mpeg',
  }
}

async function* iterateStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  const reader = body.getReader()
  try {
    while (true) {
      if (signal?.aborted) break
      const { value, done } = await reader.read()
      if (done) break
      if (value) yield value
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* noop */
    }
  }
}
