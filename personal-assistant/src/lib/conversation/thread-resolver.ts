/**
 * Total Recall — Thread Resolution & Message Storage
 *
 * Manages the lifecycle of conversation threads and persists individual
 * messages (turns) within them. Each user has at most one `active` thread
 * per org — the `get_or_create_active_thread` RPC handles upsert atomically.
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
} from './types'
import { logger } from '@/lib/core/logger'

// ─── Thread Resolution ──────────────────────────────────────────────────────

/**
 * Get (or create) the active conversation thread for a user + org pair.
 *
 * Uses the `get_or_create_active_thread` database function which guarantees
 * at most one active thread per (user_id, org_id) via a partial unique index.
 * If a thread was just created, `isNew` is true and the caller may want to
 * load inherited context from the most recent archived thread.
 */
export async function resolveActiveThread(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  channel: Channel,
): Promise<ThreadResolutionResult> {
  try {
    // Call the atomic upsert RPC
    const { data: threadId, error: rpcError } = await supabase.rpc(
      'get_or_create_active_thread',
      { p_user_id: userId, p_org_id: orgId },
    )

    if (rpcError || !threadId) {
      throw new Error(rpcError?.message ?? 'RPC returned null thread ID')
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

    // Update last_channel if it changed
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
      inheritedContext = await loadLatestArchivedSummary(supabase, userId, orgId)
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
 */
async function loadLatestArchivedSummary(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('conversation_threads')
    .select('compiled_summary')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'compiled')
    .order('archived_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ compiled_summary: string | null }>()

  if (error) {
    logger.warn('[thread-resolver] Failed to load archived summary:', error.message)
    return undefined
  }

  return data?.compiled_summary ?? undefined
}
