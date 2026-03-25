import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { loadRecentMessages, listUserThreads, archiveThread } from '@/lib/conversation/thread-resolver'
import type { Channel } from '@/lib/conversation/types'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

async function resolveAuth(): Promise<{ supabase: SupabaseClient; userId: string; orgId: string } | null> {
  if (isDevBypass()) {
    return {
      supabase: getServiceClient(),
      userId: '02ce2616-c01b-45a5-a2ad-16ebe936a6b2',
      orgId: '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9',
    }
  }

  const client = await createClient()
  if (!client) return null

  const { data: { user } } = await client.auth.getUser()
  if (!user) return null

  const { data: profile } = await client
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) return null

  return { supabase: client, userId: user.id, orgId: profile.org_id }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // Authenticate
  const auth = await resolveAuth()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, userId, orgId } = auth

  // ─── Branch: search conversations ───────────────────────────────────────────
  const searchQuery = searchParams.get('search')
  if (searchQuery) {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('id, content, role, thread_id, created_at')
      .eq('org_id', orgId)
      .ilike('content', `%${searchQuery}%`)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ results: data })
  }

  // ─── Branch: list threads ───────────────────────────────────────────────
  if (searchParams.get('list') === 'threads') {
    const channel = searchParams.get('channel') as Channel | null
    const threads = await listUserThreads(supabase, userId, orgId, channel || undefined)
    return NextResponse.json({ threads })
  }

  // ─── Default: load messages for a thread ────────────────────────────────
  const threadId = searchParams.get('threadId')

  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  }

  const limitParam = searchParams.get('limit')
  const limit = Math.min(
    Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  )

  // Verify the user owns this thread
  let thread: { id: string; user_id: string } | null = null
  try {
    const { data, error } = await supabase
      .from('conversation_threads')
      .select('id, user_id')
      .eq('id', threadId)
      .single()

    if (error) {
      // Table may not exist yet (migration 067 not applied)
      const msg = error.message || ''
      if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
        return NextResponse.json({ threadId, messages: [] })
      }
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
    thread = data
  } catch {
    // Total Recall tables not available — return empty history
    return NextResponse.json({ threadId, messages: [] })
  }

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  if (thread.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load messages (returned newest-first, reverse for chronological display)
  const messages = await loadRecentMessages(supabase, threadId, limit)
  messages.reverse()

  return NextResponse.json({ threadId, messages })
}

export async function DELETE(request: NextRequest) {
  const auth = await resolveAuth()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase: delSupabase, userId: delUserId } = auth

  // Parse body
  const { threadId } = await request.json()
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  }

  // Verify the user owns this thread
  const { data: thread, error: fetchError } = await delSupabase
    .from('conversation_threads')
    .select('id, user_id')
    .eq('id', threadId)
    .single()

  if (fetchError || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  if (thread.user_id !== delUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Archive the thread (userId check provides defense-in-depth)
  const archived = await archiveThread(delSupabase, threadId, delUserId)
  if (!archived) {
    return NextResponse.json({ error: 'Failed to archive thread' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
