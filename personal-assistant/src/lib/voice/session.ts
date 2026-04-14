/**
 * Voice session orchestrator (server side).
 *
 * One invocation per voice turn:
 *   1. Transcribe the client's recorded audio (Whisper, P1 batch; P2 streams).
 *   2. Run the UnifiedConversationPipeline with `voiceMode: true` so the
 *      assistant responds in voice-friendly prose.
 *   3. While TAOR streams `content_delta` events, feed the sentence splitter.
 *      Each completed sentence kicks off a parallel ElevenLabs synth.
 *   4. Yield a single transport-agnostic event stream — the route (`/api/voice/stream`)
 *      serialises this to SSE; a future WS route will do the same, different frame.
 *
 * Barge-in (Phase 2): the caller passes an `AbortSignal`; this module drops
 * any in-flight synth and returns. The TAOR loop has its own abortSignal
 * check (see `src/lib/agent/engine/taor-loop.ts`).
 *
 * NOTE: audio chunks are base64-encoded when serialised to SSE. That's a ~33%
 * overhead but avoids a second channel. WS transport (Phase 2) will send them
 * as binary frames.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import type { PipelineEvent } from '@/lib/conversation/unified-pipeline'
import { createSentenceSplitter } from './sentence-splitter'
import { synthesizeSentence } from './tts-stream'
import { inferVoiceHint } from '@/lib/agent/ai-sdk-bridge'
import { logger } from '@/lib/core/logger'
import { randomUUID } from 'crypto'

// ─── Event shape emitted to clients ──────────────────────────────────────

export type VoiceEvent =
  | { type: 'transcript'; data: { text: string; final: true } }
  | { type: 'agent_event'; data: PipelineEvent }
  | { type: 'voice_suppressed'; data: { reason: string } }
  | { type: 'tts_sentence_start'; data: { sentenceId: string; text: string } }
  | { type: 'tts_audio'; data: { sentenceId: string; audioBase64: string; contentType: string } }
  | { type: 'tts_sentence_end'; data: { sentenceId: string } }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: { turnMs: number } }

export interface VoiceTurnInput {
  supabase: SupabaseClient
  identity: {
    userId: string
    orgId: string
    email?: string
    displayName?: string
  }
  threadId?: string
  /** The recorded audio blob for this turn (client-side MediaRecorder output). */
  audioBlob: {
    arrayBuffer: () => Promise<ArrayBuffer>
    type?: string
    name?: string
  }
  /** Optional: abort an in-flight turn (barge-in). */
  signal?: AbortSignal
}

// ─── Whisper transcription (P1: batch) ───────────────────────────────────

async function transcribe(
  audioBlob: VoiceTurnInput['audioBlob'],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured for transcription')
  }

  const buf = await audioBlob.arrayBuffer()
  const form = new FormData()
  const blob = new Blob([buf], { type: audioBlob.type || 'audio/webm' })
  form.append('file', blob, audioBlob.name || 'audio.webm')
  form.append('model', 'whisper-1')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown')
    logger.error('[voice/session] Whisper error', { status: res.status, body: body.slice(0, 300) })
    throw new Error(`Transcription failed: ${res.status}`)
  }

  const json = (await res.json()) as { text?: string }
  return (json.text || '').trim()
}

// ─── TTS synth dispatch ──────────────────────────────────────────────────

interface PendingSynth {
  sentenceId: string
  text: string
  index: number
  promise: Promise<void>
}

/** Encodes a Uint8Array to base64 without blowing the stack on large buffers. */
function toBase64(bytes: Uint8Array): string {
  // Buffer exists in Node; this module is server-only.
  return Buffer.from(bytes).toString('base64')
}

// ─── Main entry ──────────────────────────────────────────────────────────

export async function* runVoiceTurn(input: VoiceTurnInput): AsyncGenerator<VoiceEvent> {
  const turnStartMs = Date.now()
  const voiceTurnId = randomUUID()

  // 1. Transcribe
  let transcript: string
  try {
    transcript = await transcribe(input.audioBlob, input.signal)
  } catch (err) {
    yield { type: 'error', data: { message: err instanceof Error ? err.message : 'Transcription failed' } }
    yield { type: 'done', data: { turnMs: Date.now() - turnStartMs } }
    return
  }

  if (!transcript) {
    yield { type: 'error', data: { message: 'No speech detected' } }
    yield { type: 'done', data: { turnMs: Date.now() - turnStartMs } }
    return
  }

  yield { type: 'transcript', data: { text: transcript, final: true } }

  if (input.signal?.aborted) {
    yield { type: 'done', data: { turnMs: Date.now() - turnStartMs } }
    return
  }

  // 2. Run pipeline with voiceMode
  const pipeline = new UnifiedConversationPipeline(input.supabase)
  const events = pipeline.handleMessage(
    {
      content: transcript,
      channel: 'web',
      channelMetadata: { voice: true, voiceTurnId },
    },
    {
      supabase: input.supabase,
      identity: input.identity,
      threadId: input.threadId,
      engineOverrides: {
        voiceMode: true,
        abortSignal: input.signal,
      },
    },
  )

  // 3. Stream content_deltas → sentence splitter → parallel TTS
  const splitter = createSentenceSplitter()
  const pendingSynths: PendingSynth[] = []
  let synthIndex = 0
  let responseBuffer = ''
  let voiceSuppressed = false
  let suppressionEmitted = false

  // Bounded queue between producer (pipeline loop) and consumer (this generator).
  // We need this because TTS synths must yield audio chunks back to the caller,
  // which has to happen from inside this generator. We buffer events from both
  // sources into a single queue. Capped to prevent unbounded memory growth on
  // slow clients — non-audio events are dropped when the queue is full.
  const MAX_QUEUE_SIZE = 500
  const eventQueue: VoiceEvent[] = []
  let queueResolver: (() => void) | null = null
  let producerDone = false

  function pushEvent(ev: VoiceEvent) {
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest non-audio event to make room (preserve audio ordering)
      const dropIdx = eventQueue.findIndex(e => e.type !== 'tts_audio')
      if (dropIdx !== -1) {
        eventQueue.splice(dropIdx, 1)
      } else {
        // All audio — drop the oldest
        eventQueue.shift()
      }
    }
    eventQueue.push(ev)
    if (queueResolver) {
      queueResolver()
      queueResolver = null
    }
  }

  function waitForEvent(): Promise<void> {
    if (eventQueue.length > 0 || producerDone) return Promise.resolve()
    return new Promise(resolve => {
      queueResolver = resolve
    })
  }

  function dispatchSynth(sentence: string) {
    if (voiceSuppressed) return
    const sentenceId = `s-${synthIndex++}-${Math.random().toString(36).slice(2, 8)}`
    pushEvent({ type: 'tts_sentence_start', data: { sentenceId, text: sentence } })

    const promise = (async () => {
      try {
        const result = await synthesizeSentence(sentence, { signal: input.signal })
        for await (const chunk of result.chunks) {
          if (input.signal?.aborted) return
          pushEvent({
            type: 'tts_audio',
            data: {
              sentenceId,
              audioBase64: toBase64(chunk),
              contentType: result.contentType,
            },
          })
        }
        pushEvent({ type: 'tts_sentence_end', data: { sentenceId } })
      } catch (err) {
        if (input.signal?.aborted) return
        logger.warn('[voice/session] TTS synth failed', {
          error: err instanceof Error ? err.message : String(err),
          sentenceId,
        })
        // Non-fatal: mark the sentence complete so client doesn't hang.
        pushEvent({ type: 'tts_sentence_end', data: { sentenceId } })
      }
    })()

    pendingSynths.push({ sentenceId, text: sentence, index: synthIndex, promise })
  }

  // Producer: consume pipeline events, split content, dispatch synths
  const producer = (async () => {
    try {
      for await (const evt of events) {
        if (input.signal?.aborted) break

        // Forward every agent event to the client (UI shows tool calls etc.)
        pushEvent({ type: 'agent_event', data: evt })

        if (evt.type === 'content_delta') {
          responseBuffer += evt.data

          // Mid-stream suppression: if the model starts generating a markdown
          // table or code block, stop synthesising and let the UI show it.
          if (!voiceSuppressed) {
            const hint = inferVoiceHint(responseBuffer)
            if (!hint.shouldSpeak) {
              voiceSuppressed = true
              if (!suppressionEmitted) {
                pushEvent({ type: 'voice_suppressed', data: { reason: hint.reason } })
                suppressionEmitted = true
              }
              continue
            }
          }

          if (voiceSuppressed) continue

          const sentences = splitter.push(evt.data)
          for (const s of sentences) dispatchSynth(s)
        }

        if (evt.type === 'message') {
          // Flush any trailing text
          if (!voiceSuppressed) {
            const finalHint = inferVoiceHint(responseBuffer)
            if (finalHint.shouldSpeak) {
              const tail = splitter.flush()
              for (const s of tail) dispatchSynth(s)
            } else if (!suppressionEmitted) {
              pushEvent({ type: 'voice_suppressed', data: { reason: finalHint.reason } })
              suppressionEmitted = true
            }
          }
        }

        if (evt.type === 'done' || evt.type === 'error') break
      }
    } catch (err) {
      pushEvent({
        type: 'error',
        data: { message: err instanceof Error ? err.message : 'Pipeline failed' },
      })
    } finally {
      // Wait for any in-flight synths to deliver their remaining audio
      // (unless aborted). Errors in individual synths are already caught.
      if (!input.signal?.aborted) {
        await Promise.allSettled(pendingSynths.map(p => p.promise))
      }
      producerDone = true
      if (queueResolver) {
        queueResolver()
        queueResolver = null
      }
    }
  })()

  // Consumer: drain the queue as events arrive
  while (true) {
    if (eventQueue.length > 0) {
      yield eventQueue.shift()!
      continue
    }
    if (producerDone) break
    await waitForEvent()
  }

  await producer // ensure promises settle

  yield { type: 'done', data: { turnMs: Date.now() - turnStartMs } }
}
