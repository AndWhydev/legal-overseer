import { NextRequest } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAllAgents } from '@/lib/agent/registry-loader'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { addTimingJitter } from '@/lib/security/timing-jitter'
import { buildAttachmentContentBlocks } from '@/lib/attachments/content-blocks'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { logger } from '@/lib/core/logger'

let registryInitialized = false

export async function POST(request: NextRequest) {
  const { message, threadId, attachmentIds } = await request.json()
  if (!message) {
    return new Response('Message required', { status: 400 })
  }

  if (!registryInitialized) {
    loadAllAgents()
    registryInitialized = true
  }

  // Authenticate and get org_id
  let supabase: SupabaseClient
  let userId: string
  let userEmail: string | undefined
  let orgId: string
  let displayName: string | undefined

  if (isDevBypass()) {
    // Dev mode: use service client with hardcoded Tor user/org
    supabase = getServiceClient()
    userId = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
    orgId = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
    userEmail = 'hi@torkay.com'
    displayName = 'Tor'
    logger.warn('[chat] Using dev bypass auth')
  } else {
    // Try Bearer token auth first (mobile clients), then fall back to cookie auth (web)
    let bearerAuth: Awaited<ReturnType<typeof authenticateBearer>> = null
    try {
      bearerAuth = await authenticateBearer(request)
    } catch (err) {
      // Bearer token was present but invalid -- return the error immediately
      if (err instanceof Response) return err
      return new Response('Unauthorized', { status: 401 })
    }

    if (bearerAuth) {
      // Authenticated via Bearer token (mobile) -- use service client for DB operations
      supabase = getServiceClient()
      userId = bearerAuth.user.id
      userEmail = bearerAuth.user.email
      orgId = bearerAuth.orgId
      displayName = bearerAuth.displayName
      logger.info('[chat] Authenticated via Bearer token', { userId })
    } else {
      // Fall back to cookie-based auth (web)
      const client = await createClient()
      if (!client) {
        return new Response('Supabase not configured', { status: 503 })
      }

      const { data: { user } } = await client.auth.getUser()
      if (!user) {
        return new Response('Unauthorized', { status: 401 })
      }

      const { data: profile } = await client
        .from('profiles')
        .select('org_id, display_name')
        .eq('id', user.id)
        .single()

      if (!profile) {
        return new Response('No profile found', { status: 400 })
      }

      supabase = client
      userId = user.id
      userEmail = user.email ?? undefined
      orgId = profile.org_id
      displayName = profile.display_name
        || user.user_metadata?.display_name
        || user.email?.split('@')[0]
        || undefined
    }
  }

  // Per-user rate limit
  const rateLimited = checkUserEndpointLimit(userId, '/api/agent/chat')
  if (rateLimited) return rateLimited

  // Injection detection — silent neutralization
  let processedMessage = message
  const injection = detectInjection(message)
  if (injection.detected) {
    logger.warn('injection_detected', { userId, orgId, patterns: injection.patterns })
    processedMessage = neutralizeInjection(message)
  }

  // ── Build multimodal content blocks from attachments ──────────────
  let attachmentContentBlocks: Anthropic.ContentBlockParam[] = []
  let attachmentMetadata: Array<{ type: string; url: string; name: string; size: number }> | undefined

  if (attachmentIds?.length > 0) {
    try {
      // Load attachment records from DB (org-scoped for security)
      const { data: attachments, error: attError } = await supabase
        .from('attachments')
        .select('id, filename, mime_type, size, storage_path, extracted_text')
        .in('id', attachmentIds)
        .eq('org_id', orgId)
        .eq('status', 'ready')

      if (attError) {
        logger.warn('[chat] Failed to load attachments', { error: attError.message })
      } else if (attachments && attachments.length > 0) {
        attachmentContentBlocks = await buildAttachmentContentBlocks(supabase, attachments)
        attachmentMetadata = attachments.map(a => ({
          type: a.mime_type,
          url: a.storage_path,
          name: a.filename,
          size: a.size ?? 0,
        }))
        logger.info('[chat] Built attachment content blocks', {
          requested: attachmentIds.length,
          loaded: attachments.length,
          blocks: attachmentContentBlocks.length,
        })
      }
    } catch (err) {
      // Non-fatal: log but continue without attachments
      logger.warn('[chat] Attachment processing failed, proceeding without', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const pipeline = new UnifiedConversationPipeline(supabase)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Timing jitter before first byte to defeat latency-based model fingerprinting
        await addTimingJitter()
        const events = pipeline.handleMessage(
          {
            content: processedMessage,
            channel: 'web',
            attachmentIds: attachmentIds || undefined,
            channelMetadata: attachmentMetadata
              ? { attachments: attachmentMetadata }
              : undefined,
          },
          {
            supabase,
            identity: {
              userId,
              orgId,
              email: userEmail,
              displayName,
            },
            threadId: threadId || undefined,
            contentBlocks: attachmentContentBlocks.length > 0
              ? attachmentContentBlocks
              : undefined,
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
