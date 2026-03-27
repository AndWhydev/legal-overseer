import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateWelcomeMessage,
  generateFallbackWelcomeMessage,
} from '@/lib/onboarding/welcome-conversation'
import type { FirstRunDiscoveryResult } from '@/lib/onboarding/first-run-discovery'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/welcome
 *
 * Creates the welcome conversation after onboarding completes.
 * 1. Reads first_run_discovery from profile preferences
 * 2. Generates personalized welcome message (template, no LLM)
 * 3. Creates conversation thread + assistant message
 * 4. Returns { conversationId, message }
 */
export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, preferences')
    .eq('id', user.id)
    .single<{ org_id: string; preferences: Record<string, unknown> | null }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No org found' }, { status: 400 })
  }

  try {
    // Read discovery result from profile preferences
    const discoveryResult = profile.preferences?.first_run_discovery as FirstRunDiscoveryResult | undefined

    // Generate message
    let welcomeText: string
    if (discoveryResult && discoveryResult.topContacts) {
      const connectedChannels = Object.keys(discoveryResult.stats?.channelBreakdown ?? {})
      welcomeText = generateWelcomeMessage({
        userIdentity: discoveryResult.userIdentity,
        topContacts: discoveryResult.topContacts,
        activeThreads: discoveryResult.activeThreads,
        insights: discoveryResult.insights,
        connectedChannels,
      })
    } else {
      welcomeText = generateFallbackWelcomeMessage()
    }

    // Create the conversation thread
    let threadId: string | null = null

    try {
      // Try using the RPC to create a thread
      const { data: tid, error: rpcError } = await supabase.rpc(
        'get_or_create_active_thread',
        { p_user_id: user.id, p_org_id: profile.org_id, p_channel: 'web' },
      )

      if (!rpcError && tid) {
        threadId = tid

        // Update thread title
        await supabase
          .from('conversation_threads')
          .update({ title: 'Welcome to BitBit' })
          .eq('id', threadId)
      }
    } catch {
      // RPC may not be available -- fall back to direct insert
    }

    // Fallback: direct insert if RPC failed
    if (!threadId) {
      const { data: thread, error: insertError } = await supabase
        .from('conversation_threads')
        .insert({
          user_id: user.id,
          org_id: profile.org_id,
          title: 'Welcome to BitBit',
          status: 'active',
          last_channel: 'web',
          last_activity_at: new Date().toISOString(),
          message_count: 0,
          turn_count: 0,
          token_estimate: 0,
          metadata: { source: 'onboarding-welcome' },
        })
        .select('id')
        .single<{ id: string }>()

      if (insertError || !thread) {
        logger.error('[api/chat/welcome] Failed to create thread', {
          error: insertError?.message,
        })
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }

      threadId = thread.id
    }

    // Insert the welcome message as an assistant message
    let turnNumber = 1
    try {
      const { data: tn } = await supabase.rpc('next_turn_number', { p_thread_id: threadId })
      if (tn != null) turnNumber = tn
    } catch {
      // Use default turn 1
    }

    const { data: message, error: msgError } = await supabase
      .from('conversation_messages')
      .insert({
        thread_id: threadId,
        user_id: user.id,
        org_id: profile.org_id,
        turn_number: turnNumber,
        role: 'assistant',
        channel: 'web',
        content: welcomeText,
        metadata: { source: 'onboarding-welcome', has_discovery: !!discoveryResult },
      })
      .select('id, content, created_at')
      .single<{ id: string; content: string; created_at: string }>()

    if (msgError) {
      logger.error('[api/chat/welcome] Failed to insert message', {
        error: msgError.message,
        threadId,
      })
      return NextResponse.json({ error: 'Failed to create welcome message' }, { status: 500 })
    }

    // Update thread counters
    await supabase
      .from('conversation_threads')
      .update({
        message_count: 1,
        turn_count: 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    logger.info('[api/chat/welcome] Welcome conversation created', {
      userId: user.id,
      threadId,
      hasDiscovery: !!discoveryResult,
    })

    return NextResponse.json({
      success: true,
      conversationId: threadId,
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.created_at,
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/chat/welcome] Failed', { userId: user.id, error })
    return NextResponse.json({ error }, { status: 500 })
  }
}
