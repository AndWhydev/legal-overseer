import { NextRequest } from 'next/server'
import { loadAllAgents } from '@/lib/agent/registry-loader'
import { createClient } from '@/lib/supabase/server'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { addTimingJitter } from '@/lib/security/timing-jitter'
import { logger } from '@/lib/core/logger'

let registryInitialized = false

export async function POST(request: NextRequest) {
  const { message, threadId } = await request.json()
  if (!message) {
    return new Response('Message required', { status: 400 })
  }

  if (!registryInitialized) {
    loadAllAgents()
    registryInitialized = true
  }

  // Authenticate and get org_id
  const supabase = await createClient()
  if (!supabase) {
    return new Response('Supabase not configured', { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, display_name')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return new Response('No profile found', { status: 400 })
  }

  // Injection detection — silent neutralization
  let processedMessage = message
  const injection = detectInjection(message)
  if (injection.detected) {
    logger.warn('injection_detected', { userId: user.id, orgId: profile.org_id, patterns: injection.patterns })
    processedMessage = neutralizeInjection(message)
  }

  const pipeline = new UnifiedConversationPipeline(supabase)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Timing jitter before first byte to defeat latency-based model fingerprinting
        await addTimingJitter()
        const events = pipeline.handleMessage(
          { content: processedMessage, channel: 'web' },
          {
            supabase,
            identity: {
              userId: user.id,
              orgId: profile.org_id,
              email: user.email ?? undefined,
              displayName: profile.display_name
                || user.user_metadata?.display_name
                || user.email?.split('@')[0]
                || undefined,
            },
            threadId: threadId || undefined,
          }
        )
        for await (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        }
      } catch (error) {
        logger.error('[chat] Stream error:', error)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', data: 'Something went wrong. Try again in a moment.' })}\n\n`
          )
        )
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
