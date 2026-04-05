/**
 * Total Recall — Unified Conversation Pipeline
 *
 * Orchestrates: identity resolution → thread resolution → store inbound →
 * load history → engine call → store response → async post-processing.
 *
 * Yields AgentEvent from engine.ts, allowing the chat route to stream
 * events directly to the client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { resolveChannelIdentity } from './identity-resolver'
import { resolveActiveThread, storeMessage, loadRecentMessages, generateThreadTitle } from './thread-resolver'
import { runAgentChat, type AgentEvent, type EngineConfig } from '@/lib/agent/engine'
import { getDefaultAgentConfigId } from '@/lib/agent/agent-config'
import { logger } from '@/lib/core/logger'
import { MemoryConsolidator } from '@/lib/memory/memory-consolidator'
import { getMemoryExtractor } from '@/lib/memory-palace'
import { enqueueEmbedding } from '@/lib/rag/embedding-queue'
import { extractAndPopulateGraph } from '@/lib/knowledge-graph/entity-extractor'
import type {
  Channel,
  InboundMessage,
  PipelineResult,
  ResolvedIdentity,
  ConversationMessageRecord,
} from './types'

/** Pipeline-specific event emitted before engine events */
export type PipelineEvent =
  | AgentEvent
  | { type: 'thread'; data: { threadId: string; isNew: boolean } }

// Re-export for consumers
export type { InboundMessage, PipelineResult }

interface PipelineConfig {
  supabase: SupabaseClient
  /** Pre-resolved identity (web chat provides userId/orgId directly from auth) */
  identity?: { userId: string; orgId: string; email?: string; displayName?: string }
  /** Explicit thread to continue */
  threadId?: string
  /** Engine overrides */
  engineOverrides?: Partial<EngineConfig>
  /** Multimodal content blocks from file attachments (images, PDFs, documents) */
  contentBlocks?: Anthropic.ContentBlockParam[]
}

interface PersistedToolTrace {
  id: string
  name: string
  input: Record<string, unknown> | undefined
  result?: unknown
  success?: boolean
  queued?: boolean
  approvalId?: string
  elapsedMs?: number
}

/**
 * Convert stored conversation messages to Anthropic MessageParam format
 * for injection into engine history.
 */
function messagesToHistory(messages: ConversationMessageRecord[]): Anthropic.MessageParam[] {
  const history: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      history.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      history.push({ role: 'assistant', content: msg.content })
    }
    // tool_call and tool_result roles are skipped — the engine replays
    // tool interactions within its own loop; including partial tool state
    // in history would confuse the model.
  }

  return history
}

/**
 * UnifiedConversationPipeline — single entry point for all channels.
 *
 * Web chat, WhatsApp, SMS, Email, Slack, and iMessage all funnel through
 * handleMessage(), which resolves identity, finds or creates a thread,
 * persists inbound/outbound messages, and streams AgentEvents from the engine.
 */
export class UnifiedConversationPipeline {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Main entry point. Async generator that yields AgentEvent objects
   * for streaming to the client.
   */
  async *handleMessage(
    inbound: InboundMessage,
    config: PipelineConfig
  ): AsyncGenerator<PipelineEvent> {
    const startTime = Date.now()

    // ── Step 0: Defense-in-depth injection guard ────────────────────────
    // This catches injection attempts from ALL channels (WhatsApp, SMS,
    // email, Telegram, web) even if the route-level guard was bypassed.
    const injection = detectInjection(inbound.content)
    if (injection.detected) {
      logger.warn('[pipeline] injection_detected', {
        channel: inbound.channel,
        patterns: injection.patterns,
        userId: config.identity?.userId ?? inbound.userId,
      })
      inbound = { ...inbound, content: neutralizeInjection(inbound.content) }
    }

    // ── Step 1: Identity Resolution ────────────────────────────────────
    let identity: ResolvedIdentity

    if (config.identity) {
      // Web chat: identity already resolved from Supabase Auth session
      identity = {
        userId: config.identity.userId,
        orgId: config.identity.orgId,
        email: config.identity.email,
        displayName: config.identity.displayName,
        isAuthenticated: true,
      }
    } else if (inbound.userId && inbound.orgId) {
      // Pre-resolved from webhook handler
      identity = {
        userId: inbound.userId,
        orgId: inbound.orgId,
        isAuthenticated: false,
      }
    } else if (inbound.channelIdentifier) {
      // External channel: resolve via identity lookup
      try {
        const resolved = await resolveChannelIdentity(
          this.supabase,
          inbound.channelIdentifier
        )
        if (!resolved) {
          yield { type: 'error', data: 'Could not resolve sender identity' }
          yield { type: 'done', data: {} }
          return
        }
        identity = resolved
      } catch (err) {
        logger.error('[pipeline] Identity resolution failed', { err, channel: inbound.channel })
        yield { type: 'error', data: 'Could not resolve sender identity' }
        yield { type: 'done', data: {} }
        return
      }
    } else {
      yield { type: 'error', data: 'No identity information provided' }
      yield { type: 'done', data: {} }
      return
    }

    // ── Step 2: Thread Resolution ──────────────────────────────────────
    let threadId: string | null = null
    let isNewThread = false
    let totalRecallAvailable = true
    try {
      if (config.threadId) {
        // Explicit thread (e.g., frontend sent threadId from prior session)
        threadId = config.threadId
      } else {
        const threadResult = await resolveActiveThread(
          this.supabase,
          identity.userId,
          identity.orgId,
          inbound.channel
        )
        threadId = threadResult.thread.id
        isNewThread = threadResult.isNew
      }
    } catch (err) {
      // Total Recall tables may not exist yet (migration 067 not applied).
      // Fall back to threadless mode — the engine still works without persistence.
      const errMsg = err instanceof Error ? err.message : String(err)
      const isSchemaError =
        errMsg.includes('does not exist') ||
        errMsg.includes('could not find') ||
        errMsg.includes('relation') ||
        errMsg.includes('function') ||
        errMsg.includes('42P01') || // PostgreSQL: undefined_table
        errMsg.includes('42883')    // PostgreSQL: undefined_function
      if (isSchemaError) {
        logger.warn('[pipeline] Total Recall tables not available, falling back to threadless mode', {
          error: errMsg,
          userId: identity.userId,
        })
        totalRecallAvailable = false
      } else {
        logger.error('[pipeline] Thread resolution failed', { err, userId: identity.userId })
        totalRecallAvailable = false
      }
    }

    // Emit thread info so frontends can track the active thread
    if (threadId) {
      yield { type: 'thread', data: { threadId, isNew: isNewThread } }
    }

    // ── Step 3: Store Inbound Message ──────────────────────────────────
    let storedMessageId: string | undefined
    if (threadId && totalRecallAvailable) {
      try {
        const stored = await storeMessage(this.supabase, {
          threadId,
          userId: identity.userId,
          orgId: identity.orgId,
          role: 'user',
          channel: inbound.channel,
          content: inbound.content,
          channelMetadata: inbound.channelMetadata,
        })
        storedMessageId = stored.id
      } catch (err) {
        // Non-fatal: log but continue — we still want to process the message
        logger.error('[pipeline] Failed to store inbound message', { err, threadId })
      }
    }

    // ── Step 4: Load History ───────────────────────────────────────────
    // This serves as a fallback if ContextAssembler (used by the engine
    // when threadId+userId are provided) is unavailable or fails.
    let history: Anthropic.MessageParam[] = []
    if (threadId && totalRecallAvailable) {
      try {
        const recentMessages = await loadRecentMessages(this.supabase, threadId, 20)
        // Exclude the message we just stored by ID (not content — content
        // matching would also remove older messages with the same text)
        const priorMessages = storedMessageId
          ? recentMessages.filter(m => m.id !== storedMessageId)
          : recentMessages
        history = messagesToHistory(priorMessages)
      } catch (err) {
        // Non-fatal: proceed without history
        logger.warn('[pipeline] Failed to load history, proceeding without', { err, threadId })
      }
    }

    // ── Step 5: Run Engine ─────────────────────────────────────────────
    // Resolve the default agent config for run logging
    const agentConfigId = await getDefaultAgentConfigId(this.supabase, identity.orgId)

    const engineConfig: EngineConfig = {
      orgId: identity.orgId,
      supabase: this.supabase,
      skipCostGuard: true, // Web chat doesn't use cost guard
      agentConfigId: agentConfigId ?? undefined,
      history,
      // Wire up thread context so the engine activates ContextAssembler
      // for rich history (key facts, compressed summaries, pending actions)
      threadId: threadId || undefined,
      userId: identity.userId,
      // User identity for system prompt anchoring
      userEmail: identity.email,
      userDisplayName: identity.displayName,
      // Multimodal content blocks from file attachments
      contentBlocks: config.contentBlocks,
      // Channel the message arrived from
      channel: inbound.channel as EngineConfig["channel"],
      ...config.engineOverrides,
    }

    let responseContent = ''
    const toolTraceOrder: string[] = []
    const toolTraceById = new Map<string, PersistedToolTrace>()

    try {
      const events = runAgentChat(inbound.content, engineConfig)
      for await (const event of events) {
        // Capture the final message text for storage
        if (event.type === 'message') {
          responseContent = event.data
        }

        if (event.type === 'tool_call') {
          const callId = event.data.callId
          if (!toolTraceById.has(callId)) {
            toolTraceOrder.push(callId)
          }
          toolTraceById.set(callId, {
            id: callId,
            name: event.data.name,
            input: (event.data.input && typeof event.data.input === 'object' && !Array.isArray(event.data.input))
              ? event.data.input as Record<string, unknown>
              : undefined,
          })
        }

        if (event.type === 'tool_progress') {
          const existing = toolTraceById.get(event.data.callId)
          if (existing) {
            existing.elapsedMs = event.data.elapsed_ms
            toolTraceById.set(event.data.callId, existing)
          }
        }

        if (event.type === 'tool_result') {
          const existing = toolTraceById.get(event.data.callId)
          const nextTrace: PersistedToolTrace = {
            id: event.data.callId,
            name: event.data.name,
            input: existing?.input,
            result: event.data.result,
            success: event.data.success,
            queued: event.data.queued,
            approvalId: event.data.approvalId,
            elapsedMs: existing?.elapsedMs,
          }

          if (!toolTraceById.has(event.data.callId)) {
            toolTraceOrder.push(event.data.callId)
          }
          toolTraceById.set(event.data.callId, nextTrace)
        }

        yield event
      }
    } catch (err) {
      logger.error('[pipeline] Engine execution failed', { err, threadId })
      yield { type: 'error', data: 'Agent engine failed' }
      yield { type: 'done', data: {} }
      return
    }

    // ── Step 6: Store Assistant Response ────────────────────────────────
    if ((responseContent || toolTraceOrder.length > 0) && threadId && totalRecallAvailable) {
      try {
        await storeMessage(this.supabase, {
          threadId,
          userId: identity.userId,
          orgId: identity.orgId,
          role: 'assistant',
          channel: inbound.channel,
          content: responseContent,
          metadata: toolTraceOrder.length > 0
            ? {
                tool_calls: toolTraceOrder
                  .map(callId => toolTraceById.get(callId))
                  .filter((trace): trace is PersistedToolTrace => Boolean(trace)),
              }
            : undefined,
        })
      } catch (err) {
        logger.error('[pipeline] Failed to store assistant response', { err, threadId })
      }
    }

    // ── Step 7: Async Post-Processing (fire-and-forget) ────────────────
    if (threadId && totalRecallAvailable) {
      this.postProcess(
        threadId,
        identity.orgId,
        identity.userId,
        inbound.channel,
        inbound.content,
        responseContent,
      ).catch(err => {
        logger.error('[pipeline] Post-processing failed', { err, threadId })
      })
    }

    logger.info('[pipeline] Message handled', {
      threadId,
      channel: inbound.channel,
      durationMs: Date.now() - startTime,
      hasHistory: history.length > 0,
    })
  }

  /**
   * Fire-and-forget post-processing: update thread activity, extract facts,
   * enqueue embeddings. Runs after response is streamed to the client.
   */
  private async postProcess(
    threadId: string,
    orgId: string,
    userId: string,
    channel: Channel,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    // Update thread last_activity_at and last_channel
    const { data: threadData } = await this.supabase
      .from('conversation_threads')
      .update({
        last_activity_at: new Date().toISOString(),
        last_channel: channel,
      })
      .eq('id', threadId)
      .select('message_count')
      .single()

    // ── Auto-generate thread title ────────────────────────────────────
    // Fire-and-forget: generates on 1st exchange, refines on 5th message
    const msgCount = threadData?.message_count ?? 0
    generateThreadTitle(
      this.supabase,
      threadId,
      userMessage,
      assistantResponse,
      msgCount,
    ).catch(err => {
      logger.warn('[pipeline] Title generation failed (non-fatal)', { err, threadId })
    })

    // ── Real-time fact extraction via MemoryConsolidator ──────────────
    // Process the user message for entity mentions, high-value signals,
    // and fact extraction. Only calls Haiku when signals are detected.
    if (userMessage && userMessage.length > 5) {
      try {
        const consolidator = new MemoryConsolidator(this.supabase)
        const result = await consolidator.processNewTurn(orgId, threadId, {
          id: '',
          thread_id: threadId,
          user_id: userId,
          org_id: orgId,
          turn_number: 0,
          role: 'user',
          channel,
          content: userMessage,
          tool_data: null,
          channel_metadata: null,
          token_count: null,
          metadata: {},
          created_at: new Date().toISOString(),
        })

        if (result.facts.length > 0) {
          logger.info('[pipeline] Extracted facts from user message', {
            threadId,
            facts: result.facts.length,
            contradictions: result.contradictions.length,
          })
        }

        // Also process the assistant response (may contain commitments, decisions)
        if (assistantResponse && assistantResponse.length > 20) {
          await consolidator.processNewTurn(orgId, threadId, {
            id: '',
            thread_id: threadId,
            user_id: userId,
            org_id: orgId,
            turn_number: 1,
            role: 'assistant',
            channel,
            content: assistantResponse,
            tool_data: null,
            channel_metadata: null,
            token_count: null,
            metadata: {},
            created_at: new Date().toISOString(),
          })
        }
      } catch (err) {
        logger.warn('[pipeline] Memory consolidation failed (non-fatal)', {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // ── Memory Palace extraction (typed memories) ─────────────────────
    // Extract structured memories (decisions, facts, patterns, pricing)
    // from the conversation turn. Runs alongside the existing consolidator.
    if (userMessage && assistantResponse) {
      try {
        const extractor = getMemoryExtractor()
        await extractor.extractAndStore(this.supabase, {
          orgId,
          threadId,
          userMessage,
          assistantMessage: assistantResponse,
          entityIds: [], // Entity resolution happens inside extractor
          entityNames: [],
          channel,
        })
      } catch (err) {
        logger.warn('[pipeline] Memory Palace extraction failed (non-fatal)', {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // ── Enqueue conversation messages for RAG embedding ──────────────
    // Both user message and assistant response get embedded into Pinecone
    // for future semantic retrieval via search_memory.
    if (userMessage && userMessage.length > 10) {
      const msgId = `conv-${threadId}-user-${Date.now()}`
      enqueueEmbedding(this.supabase, orgId, msgId, userMessage, {
        message_id: msgId,
        org_id: orgId,
        channel: channel,
        sender: userId,
        received_at: new Date().toISOString(),
        chunk_index: 0,
        total_chunks: 1,
        is_full_body: true,
      }).catch(() => {}) // fire-and-forget
    }

    if (assistantResponse && assistantResponse.length > 20) {
      const msgId = `conv-${threadId}-asst-${Date.now()}`
      enqueueEmbedding(this.supabase, orgId, msgId, assistantResponse, {
        message_id: msgId,
        org_id: orgId,
        channel: channel,
        sender: 'bitbit',
        received_at: new Date().toISOString(),
        chunk_index: 0,
        total_chunks: 1,
        is_full_body: true,
      }).catch(() => {}) // fire-and-forget
    }

    // ── Knowledge graph entity extraction (fire-and-forget) ───────────
    if (userMessage && userMessage.length > 10) {
      extractAndPopulateGraph(this.supabase, orgId, userMessage, {
        sender: userId,
        channel: channel,
        timestamp: new Date().toISOString(),
      }).catch(() => {}) // fire-and-forget
    }
  }
}