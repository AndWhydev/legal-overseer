import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { logger } from '@/lib/core/logger'

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const DEFAULT_VOICE_ID = 'pFZP5JQG7iQjIQuC4Bku' // Lily

interface TTSRequestBody {
  text: string
  voice_id?: string
}

/**
 * TTS endpoint: accepts JSON { text, voice_id? },
 * streams back audio/mpeg from ElevenLabs.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimited = checkUserEndpointLimit(user.id, '/api/ai/tts')
  if (rateLimited) return rateLimited

  let body: TTSRequestBody
  try {
    body = (await request.json()) as TTSRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { text, voice_id } = body
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text field is required' }, { status: 400 })
  }

  const voiceId = voice_id || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID

  try {
    const elevenLabsRes = await fetch(
      `${ELEVENLABS_BASE_URL}/${encodeURIComponent(voiceId)}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!elevenLabsRes.ok) {
      const errText = await elevenLabsRes.text()
      logger.error('[ai/tts] ElevenLabs API error:', elevenLabsRes.status, errText)
      return NextResponse.json(
        { error: 'Text-to-speech generation failed' },
        { status: 502 }
      )
    }

    if (!elevenLabsRes.body) {
      logger.error('[ai/tts] ElevenLabs returned no body')
      return NextResponse.json(
        { error: 'Text-to-speech generation failed' },
        { status: 502 }
      )
    }

    return new Response(elevenLabsRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    logger.error('[ai/tts] ElevenLabs request failed:', err)
    return NextResponse.json(
      { error: 'Text-to-speech service unavailable' },
      { status: 502 }
    )
  }
}
