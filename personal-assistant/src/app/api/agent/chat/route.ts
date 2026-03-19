import { NextRequest } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { loadAllAgents } from '@/lib/agent/registry-loader'
import { createClient } from '@/lib/supabase/server'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { addTimingJitter } from '@/lib/security/timing-jitter'
import { buildAttachmentContentBlocks } from '@/lib/attachments/content-blocks'
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
        .eq('org_id', profile.org_id)
        .eq('status', 'ready')

      if (attError) {
        logger.warn('[chat] Failed to load attachments', { error: attError.message })
      } else if (attachments && attachments.length > 0) {
        attachmentContentBlocks = await buildAttachmentContentBlocks(supabase, attachments)
        attachmentMetadata = attachments.map(a => ({
          type: a.mime_type,
          url: a.storage_path,
          name: a.filename,
          size: a.file_size ?? 0,
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
              userId: user.id,
              orgId: profile.org_id,
              email: user.email ?? undefined,
              displayName: profile.display_name
                || user.user_metadata?.display_name
                || user.email?.split('@')[0]
                || undefined,
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
