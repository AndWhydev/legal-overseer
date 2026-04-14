import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { assembleContext } from '@/lib/context/assembler'
import { getPack, resolveIndustry } from '@/lib/industry/registry'
import { resolveModel } from '@/lib/agent/model-registry'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { getOpenAIEndpoint } from '@/lib/ai/openai-gateway'
import { logger } from '@/lib/core/logger';

/**
 * LEGACY voice endpoint: accepts audio via multipart/form-data, transcribes
 * with OpenAI Whisper, then routes through a lightweight Anthropic call.
 *
 * This path BYPASSES the TAOR loop, tool registry, context assembler, and
 * prompt cache — it produces a meaningfully worse assistant than the text
 * chat does. It has been superseded by realtime voice mode at
 * `/api/voice/stream`, which routes every turn through
 * `UnifiedConversationPipeline`.
 *
 * Still active by default because the floating pill's hold-to-talk flow
 * (`bitbit-overlay.tsx` → `stopVoiceAndProcess`) calls this endpoint. Set
 * `LEGACY_VOICE=0` to return 410 Gone for this route; scheduled for full
 * migration + deletion in Phase 4 of the voice-to-voice rollout.
 */
export async function POST(request: Request) {
  if (process.env.LEGACY_VOICE === '0') {
    return NextResponse.json(
      {
        error: 'Legacy voice endpoint is disabled. Use /api/voice/stream.',
        replacement: '/api/voice/stream',
      },
      { status: 410 },
    )
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateLimited = checkUserEndpointLimit(user.id, '/api/ai/voice')
  if (rateLimited) return rateLimited

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with audio file' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  if (!audioFile) {
    return NextResponse.json({ error: 'audio field is required' }, { status: 400 })
  }

  // Transcribe audio
  let transcript: string
  const endpoint = getOpenAIEndpoint()

  if (endpoint) {
    try {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
      const whisperForm = new FormData()
      const blob = new Blob([audioBuffer], { type: audioFile.type || 'audio/webm' })
      whisperForm.append('file', blob, audioFile.name || 'audio.webm')
      whisperForm.append('model', 'whisper-1')

      const whisperRes = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: endpoint.authorization },
        body: whisperForm,
      })

      if (!whisperRes.ok) {
        const errBody = await whisperRes.text()
        logger.error('[ai/voice] Whisper API error:', errBody)
        return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
      }

      const whisperData = await whisperRes.json() as { text: string }
      transcript = whisperData.text
    } catch (err) {
      logger.error('[ai/voice] Whisper request failed:', err)
      return NextResponse.json({ error: 'Transcription service unavailable' }, { status: 502 })
    }
  } else {
    return NextResponse.json({
      error: 'Voice transcription not available — configure AI_GATEWAY_API_KEY or OPENAI_API_KEY',
      transcript: null,
      response: null,
    }, { status: 503 })
  }

  if (!transcript || transcript.trim().length === 0) {
    return NextResponse.json({ transcript: '', response: 'No speech detected in audio.' })
  }

  // Route transcribed text through the AI pipeline (same logic as /ai/text)
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({ transcript, response: null, error: 'AI service not configured' }, { status: 503 })
  }

  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  let industry: string | undefined
  try {
    const { data: org } = await supabase
      .from('organisations')
      .select('industry')
      .eq('id', orgId)
      .single()
    industry = (org?.industry as string) ?? undefined
  } catch { /* use default */ }

  const pack = getPack(resolveIndustry(industry))

  let contextSummary = ''
  try {
    const briefing = await assembleContext(supabase, orgId, transcript)
    contextSummary = briefing.summary
  } catch (err) {
    logger.warn('[ai/voice] Context assembly failed:', err)
  }

  const systemParts: string[] = [
    `You are ${pack.persona.name}, an AI operations assistant for ${pack.persona.context}. ${pack.persona.systemPromptSuffix} The user sent a voice message. Be concise and action-oriented.`,
  ]
  if (contextSummary) {
    systemParts.push(`\nRelevant context:\n${contextSummary}`)
  }

  try {
    const client = new Anthropic({ apiKey: anthropicKey })
    const aiResponse = await client.messages.create({
      model: resolveModel('conversation'),
      max_tokens: 1024,
      system: systemParts.join('\n'),
      messages: [{ role: 'user', content: transcript }],
    })

    const text = aiResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return NextResponse.json({
      transcript,
      response: text,
      tokens: { input: aiResponse.usage.input_tokens, output: aiResponse.usage.output_tokens },
    })
  } catch (err) {
    logger.error('[ai/voice] Anthropic API error:', err)
    return NextResponse.json({ transcript, response: null, error: 'Something went wrong. Try again in a moment.' }, { status: 502 })
  }
}
