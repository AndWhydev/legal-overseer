/**
 * AI SDK v6 Chat Route
 *
 * Uses the AI SDK v6 UIMessageStream protocol instead of raw SSE.
 * The TAOR engine and unified pipeline are unchanged — only the
 * transport layer differs.
 */

import { NextRequest } from 'next/server'
import { createUIMessageStreamResponse } from 'ai'
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAllAgents } from '@/lib/agent/registry-loader'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { addTimingJitter } from '@/lib/security/timing-jitter'
import { buildAttachmentContentBlocks } from '@/lib/attachments/content-blocks'
import { extractFilePartAttachments } from '@/lib/attachments/extract-file-parts'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { bridgeTAORToUIStream } from '@/lib/agent/ai-sdk-bridge'
import { logger } from '@/lib/core/logger'

const MAX_MESSAGE_LENGTH = 10_000
const MAX_THREAD_ID_LENGTH = 128
const MAX_ATTACHMENT_IDS = 10

let registryInitialized = false

export async function POST(request: NextRequest) {
  const body = await request.json()

  // Support both AI SDK format ({ messages }) and legacy format ({ message })
  let message: string
  let threadId: string | undefined
  let attachmentIds: string[] | undefined
  let pendingFileParts: Array<{ type: string; [key: string]: unknown }> | undefined

  if (body.messages && Array.isArray(body.messages)) {
    // AI SDK DefaultChatTransport format
    const lastUserMsg = [...body.messages].reverse().find(
      (m: { role: string }) => m.role === 'user'
    )
    if (!lastUserMsg) {
      return new Response('No user message found', { status: 400 })
    }
    // Extract text from parts array or fall back to content
    const parts = lastUserMsg.parts as Array<{ type: string; text?: string; [key: string]: unknown }> | undefined
    const textPart = parts?.find((p: { type: string }) => p.type === 'text')
    message = textPart?.text || lastUserMsg.content || ''
    threadId = body.chatId || body.id || undefined

    // Extract attachment IDs: prefer explicit body.attachmentIds (sent via
    // DefaultChatTransport body option), then fall back to inline file parts
    if (Array.isArray(body.attachmentIds) && body.attachmentIds.length > 0) {
      attachmentIds = body.attachmentIds
    } else if (parts?.some((p: { type: string }) => p.type === 'file')) {
      // File parts present — will be uploaded after auth (needs orgId/userId)
      pendingFileParts = parts
    }
  } else {
    // Legacy format
    message = body.message
    threadId = body.threadId
    attachmentIds = body.attachmentIds
  }

  if (!message) {
    return new Response('Message required', { status: 400 })
  }

  // Input length validation
  if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
    return new Response('Message too long', { status: 400 })
  }
  if (threadId && (typeof threadId !== 'string' || threadId.length > MAX_THREAD_ID_LENGTH)) {
    return new Response('Invalid threadId', { status: 400 })
  }
  if (attachmentIds && (!Array.isArray(attachmentIds) || attachmentIds.length > MAX_ATTACHMENT_IDS)) {
    return new Response('Too many attachments', { status: 400 })
  }

  if (!registryInitialized) {
    loadAllAgents()
    registryInitialized = true
  }

  // ── Authentication ────────────────────────────────────────────────────
  let supabase: SupabaseClient
  let userId: string
  let userEmail: string | undefined
  let orgId: string
  let displayName: string | undefined
  let userTimezone: string | null = null

  if (isDevBypass()) {
    supabase = getServiceClient()
    userId = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
    orgId = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
    userEmail = 'hi@torkay.com'
    displayName = 'Tor'
    userTimezone = 'Australia/Brisbane'
    logger.warn('[chat] Using dev bypass auth')
  } else {
    // Try Bearer token auth first (mobile clients), then fall back to cookie auth (web)
    let bearerAuth: Awaited<ReturnType<typeof authenticateBearer>> = null
    try {
      bearerAuth = await authenticateBearer(request)
    } catch (err) {
      if (err instanceof Response) return err
      return new Response('Unauthorized', { status: 401 })
    }

    if (bearerAuth) {
      supabase = getServiceClient()
      userId = bearerAuth.user.id
      userEmail = bearerAuth.user.email
      orgId = bearerAuth.orgId
      displayName = bearerAuth.displayName
      logger.info('[chat] Authenticated via Bearer token', { userId })
    } else {
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

    // Load user timezone (Phase 51 D1) — cheap, single row by PK.
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle()
      userTimezone = (userRow?.timezone as string | null | undefined) ?? null
    } catch (err) {
      logger.debug('[chat] Could not load user timezone — falling back to UTC', { err })
    }
  }

  // Per-user rate limit
  const rateLimited = checkUserEndpointLimit(userId, '/api/agent/chat')
  if (rateLimited) return rateLimited

  // ── Extract file parts from AI SDK messages (post-auth) ──────────────
  if (pendingFileParts && !attachmentIds) {
    const result = await extractFilePartAttachments(
      pendingFileParts,
      supabase,
      orgId,
      userId,
      threadId,
    )
    if (result.attachmentIds.length > 0) {
      attachmentIds = result.attachmentIds
    }
  }

  // Injection detection — silent neutralization
  let processedMessage = message
  const injection = detectInjection(message)
  if (injection.detected) {
    logger.warn('injection_detected', { userId, orgId, patterns: injection.patterns })
    processedMessage = neutralizeInjection(message)
  }

  // ── Build multimodal content blocks from attachments ──────────────────
  let attachmentContentBlocks: Anthropic.ContentBlockParam[] = []
  let attachmentMetadata: Array<{ type: string; url: string; name: string; size: number }> | undefined

  if (attachmentIds && attachmentIds.length > 0) {
    try {
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

  // ── Run pipeline and bridge to UIMessageStream ────────────────────────
  try {
    const pipeline = new UnifiedConversationPipeline(supabase)

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
          timezone: userTimezone,
        },
        threadId: threadId || undefined,
        contentBlocks: attachmentContentBlocks.length > 0
          ? attachmentContentBlocks
          : undefined,
      }
    )

    const stream = bridgeTAORToUIStream(events)

    return createUIMessageStreamResponse({ stream })
  } catch (err) {
    logger.error('[chat] Pipeline error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Try again in a moment.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
