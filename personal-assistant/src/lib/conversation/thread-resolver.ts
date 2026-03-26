/**
 * Total Recall — Thread Resolution & Message Storage
 *
 * Manages the lifecycle of conversation threads and persists individual
 * messages (turns) within them. Each user has at most one `active` thread
 * per (user_id, org_id, channel) — the `get_or_create_active_thread` RPC
 * handles upsert atomically using the channel parameter.
 *
 * This means a user can have separate active threads on web, WhatsApp, etc.
 * Context inheritance (archived summaries) is also channel-scoped so that
 * web threads inherit from prior web threads, WhatsApp from WhatsApp, etc.
 *
 * Message storage assigns sequential turn numbers via the `next_turn_number`
 * RPC and keeps thread counters (message_count, turn_count, token_estimate,
 * last_channel, last_activity_at) up to date.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Channel,
  ConversationThread,
  ConversationMessageRecord,
  StoreMessageParams,
  ThreadResolutionResult,
  ThreadSummaryRecord,
  ThreadStatus,
} from './types'
import { logger } from '@/lib/core/logger'

// ─── Thread Resolution ──────────────────────────────────────────────────────

/**
 * Get (or create) the active conversation thread for a user + org + channel.
 *
 * Uses the `get_or_create_active_thread` database function which guarantees
 * at most one active thread per (user_id, org_id, channel) via a partial
 * unique index. If a thread was just created, `isNew` is true and the caller
 * may want to load inherited context from the most recent archived thread
 * on the same channel.
 */
export async function resolveActiveThread(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  channel: Channel,
): Promise<ThreadResolutionResult> {
  try {
    // Try 3-param RPC first (migration 090 applied), fall back to 2-param (pre-090)
    let threadId: string | null = null
    const { data: tid3, error: err3 } = await supabase.rpc(
      'get_or_create_active_thread',
      { p_user_id: userId, p_org_id: orgId, p_channel: channel },
    )

    if (!err3 && tid3) {
      threadId = tid3
    } else {
      // Fallback: old 2-param RPC (pre-migration 090)
      const isSignatureError = err3?.message?.includes('does not exist')
        || err3?.message?.includes('42883')
      if (isSignatureError) {
        logger.info('[thread-resolver] Falling back to 2-param RPC (migration 090 not applied)')
        const { data: tid2, error: err2 } = await supabase.rpc(
          'get_or_create_active_thread',
          { p_user_id: userId, p_org_id: orgId },
        )
        if (err2 || !tid2) {
          throw new Error(err2?.message ?? 'RPC returned null thread ID')
        }
        threadId = tid2
      } else {
        throw new Error(err3?.message ?? 'RPC returned null thread ID')
      }
    }

    // Fetch the full thread record
    const { data: thread, error: fetchError } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('id', threadId)
      .single<ConversationThread>()

    if (fetchError || !thread) {
      throw new Error(fetchError?.message ?? 'Thread not found after creation')
    }

    // Update last_channel if it doesn't match (for pre-090 fallback)
    if (thread.last_channel !== channel) {
      await supabase
        .from('conversation_threads')
        .update({ last_channel: channel })
        .eq('id', thread.id)
      thread.last_channel = channel
    }

    const isNew = thread.message_count === 0

    // If new, try to inherit compiled summary from the most recent archived thread
    let inheritedContext: string | undefined
    if (isNew) {
      inheritedContext = await loadLatestArchivedSummary(supabase, userId, orgId, channel)
    }

    return { thread, isNew, inheritedContext }
  } catch (err) {
    logger.error('[thread-resolver] resolveActiveThread failed:', err)
    throw err
  }
}

// ─── Message Storage ─────────────────────────────────────────────────────────

/**
 * Store a single message (turn) in the conversation thread.
 *
 * 1. Calls `next_turn_number(thread_id)` RPC to get a gap-free sequence number.
 * 2. Inserts the message row.
 * 3. Updates thread counters (message_count, turn_count, token_estimate,
 *    last_channel, last_activity_at).
 *
 * Returns the persisted message record.
 */
export async function storeMessage(
  supabase: SupabaseClient,
  params: StoreMessageParams,
): Promise<ConversationMessageRecord> {
  try {
    // Get the next sequential turn number
    const { data: turnNumber, error: turnError } = await supabase.rpc(
      'next_turn_number',
      { p_thread_id: params.threadId },
    )

    if (turnError || turnNumber == null) {
      throw new Error(turnError?.message ?? 'Failed to get next turn number')
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from('conversation_messages')
      .insert({
        thread_id: params.threadId,
        user_id: params.userId,
        org_id: params.orgId,
        turn_number: turnNumber,
        role: params.role,
        channel: params.channel,
        content: params.content,
        tool_data: params.toolData ?? null,
        channel_metadata: params.channelMetadata ?? null,
        token_count: params.tokenCount ?? null,
        metadata: params.metadata ?? {},
      })
      .select('*')
      .single<ConversationMessageRecord>()

    if (insertError || !message) {
      throw new Error(insertError?.message ?? 'Failed to insert message')
    }

    // Update thread counters (fire-and-forget for performance)
    updateThreadCounters(supabase, params.threadId, params.channel, params.tokenCount).catch(
      (err) => logger.warn('[thread-resolver] Counter update failed:', err),
    )

    return message
  } catch (err) {
    logger.error('[thread-resolver] storeMessage failed:', err)
    throw err
  }
}

// ─── Message Loading ─────────────────────────────────────────────────────────

/**
 * Load the most recent N messages from a thread, ordered newest-first.
 * The caller can reverse for chronological display.
 */
export async function loadRecentMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit = 20,
): Promise<ConversationMessageRecord[]> {
  try {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('[thread-resolver] loadRecentMessages failed:', error.message)
      return []
    }

    return (data ?? []) as ConversationMessageRecord[]
  } catch (err) {
    logger.error('[thread-resolver] loadRecentMessages error:', err)
    return []
  }
}

/**
 * Load all summary records for a thread, ordered by tier and turn range.
 * Used by the context assembler to reconstruct compressed history.
 */
export async function loadThreadSummaries(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ThreadSummaryRecord[]> {
  try {
    const { data, error } = await supabase
      .from('thread_summaries')
      .select('*')
      .eq('thread_id', threadId)
      .order('turn_range_start', { ascending: true })

    if (error) {
      logger.error('[thread-resolver] loadThreadSummaries failed:', error.message)
      return []
    }

    return (data ?? []) as ThreadSummaryRecord[]
  } catch (err) {
    logger.error('[thread-resolver] loadThreadSummaries error:', err)
    return []
  }
}

// ─── Thread Listing ─────────────────────────────────────────────────────────

/**
 * List conversation threads for a user, optionally filtered by channel.
 * Tries the `list_user_threads` RPC first; falls back to a direct query
 * if the RPC is unavailable (e.g. migration not yet applied).
 */
export async function listUserThreads(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  channel?: Channel,
  limit = 20,
): Promise<Array<{
  id: string
  title: string | null
  status: string
  lastChannel: string
  messageCount: number
  lastActivity: string
  preview: string | null
}>> {
  try {
    // Try the RPC first
    const rpcParams: Record<string, unknown> = {
      p_user_id: userId,
      p_org_id: orgId,
      p_limit: limit,
    }
    if (channel) {
      rpcParams.p_channel = channel
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'list_user_threads',
      rpcParams,
    )

    if (!rpcError && rpcData) {
      return (rpcData as Array<Record<string, unknown>>)
        .filter((row) => row.status !== 'archived')
        .map((row) => ({
          id: row.id as string,
          title: (row.title as string | null) ?? null,
          status: row.status as string,
          lastChannel: row.last_channel as string,
          messageCount: (row.message_count as number) ?? 0,
          lastActivity: row.last_activity_at as string,
          preview: (row.preview as string | null) ?? null,
        }))
    }

    // Fallback: direct query on conversation_threads
    logger.warn('[thread-resolver] list_user_threads RPC unavailable, falling back to direct query')

    let query = supabase
      .from('conversation_threads')
      .select('id, title, status, last_channel, message_count, last_activity_at')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .order('last_activity_at', { ascending: false })
      .limit(limit)

    if (channel) {
      query = query.eq('last_channel', channel)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? null,
      status: row.status as string,
      lastChannel: row.last_channel as string,
      messageCount: (row.message_count as number) ?? 0,
      lastActivity: row.last_activity_at as string,
      preview: null, // not available in fallback query
    }))
  } catch (err) {
    logger.error('[thread-resolver] listUserThreads failed:', err)
    return []
  }
}

// ─── Thread Title Generation ────────────────────────────────────────────────

/**
 * Auto-generate a concise thread title from the conversation content.
 * Uses Haiku for speed/cost — called after the first exchange and again
 * after the 5th message to refine as the conversation evolves.
 *
 * Runs fire-and-forget from the pipeline (non-blocking).
 */
export async function generateThreadTitle(
  supabase: SupabaseClient,
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  messageCount: number,
): Promise<void> {
  // Check if thread already has a title — skip unless it's a refinement pass
  const { data: existing } = await supabase
    .from('conversation_threads')
    .select('title')
    .eq('id', threadId)
    .single()

  const hasTitle = existing?.title && existing.title.length > 0

  // Generate on: 1st exchange, 5th message (refine), or any untitled thread
  if (hasTitle && messageCount !== 5) return

  try {
    const { resolveModel } = await import('@/lib/agent/model-registry')
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()

    const useRecent = messageCount >= 5 || (messageCount > 1 && !hasTitle)
    let prompt: string

    if (useRecent) {
      // Load recent messages for better context
      const recent = await loadRecentMessages(supabase, threadId, 6)
      const context = recent
        .reverse()
        .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
        .join('\n')

      prompt = `Given this conversation, write a concise title (3-6 words, no quotes):\n\n${context}`
    } else {
      prompt = `Given this first exchange, write a concise title (3-6 words, no quotes):\n\nUser: ${userMessage.slice(0, 300)}\nAssistant: ${assistantResponse.slice(0, 300)}`
    }

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 30,
      messages: [{ role: 'user', content: prompt }],
      system: 'You generate short conversation titles. Output ONLY the title, nothing else. No quotes, no punctuation at the end. 3-6 words max.',
    })

    const title = (response.content[0] as { type: string; text: string }).text
      ?.trim()
      .replace(/^["']|["']$/g, '') // strip quotes
      .replace(/\.$/, '')          // strip trailing period

    if (title && title.length > 0 && title.length < 80) {
      await supabase
        .from('conversation_threads')
        .update({ title })
        .eq('id', threadId)
    }
  } catch (err) {
    logger.warn('[thread-resolver] Title generation failed (non-fatal):', err)
  }
}

// ─── Thread Archival ────────────────────────────────────────────────────────

/**
 * Archive a thread by setting its status to 'archived' and recording the
 * archive timestamp. Only succeeds if the requesting user owns the thread.
 * Returns true on success, false otherwise.
 */
export async function archiveThread(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error, count } = await supabase
      .from('conversation_threads')
      .update({
        status: 'archived' as ThreadStatus,
        archived_at: new Date().toISOString(),
      })
      .eq('id', threadId)
      .eq('user_id', userId)

    if (error) {
      logger.error('[thread-resolver] archiveThread failed:', error.message)
      return false
    }

    // If count is available and 0, the thread didn't belong to this user
    if (count !== null && count !== undefined && count === 0) {
      logger.warn('[thread-resolver] archiveThread: no matching thread for user', {
        threadId,
        userId,
      })
      return false
    }

    return true
  } catch (err) {
    logger.error('[thread-resolver] archiveThread error:', err)
    return false
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Increment thread counters after a message is stored.
 */
async function updateThreadCounters(
  supabase: SupabaseClient,
  threadId: string,
  channel: Channel,
  tokenCount?: number,
): Promise<void> {
  // Fetch current counters to increment
  const { data: thread, error: fetchError } = await supabase
    .from('conversation_threads')
    .select('message_count, turn_count, token_estimate')
    .eq('id', threadId)
    .single<{ message_count: number; turn_count: number; token_estimate: number }>()

  if (fetchError || !thread) {
    throw new Error(fetchError?.message ?? 'Thread not found for counter update')
  }

  const { error: updateError } = await supabase
    .from('conversation_threads')
    .update({
      message_count: thread.message_count + 1,
      turn_count: thread.turn_count + 1,
      token_estimate: thread.token_estimate + (tokenCount ?? 0),
      last_channel: channel,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', threadId)

  if (updateError) {
    throw new Error(updateError.message)
  }
}

/**
 * Load the compiled_summary from the most recently archived thread for
 * context inheritance when a new thread is created.
 * Filters by channel so web threads inherit from web, WhatsApp from WhatsApp, etc.
 */
async function loadLatestArchivedSummary(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  channel?: Channel,
): Promise<string | undefined> {
  let query = supabase
    .from('conversation_threads')
    .select('compiled_summary')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'compiled')
    .order('archived_at', { ascending: false })
    .limit(1)

  if (channel) {
    query = query.eq('last_channel', channel)
  }

  const { data, error } = await query.maybeSingle<{ compiled_summary: string | null }>()

  if (error) {
    logger.warn('[thread-resolver] Failed to load archived summary:', error.message)
    return undefined
  }

  return data?.compiled_summary ?? undefined
}
