import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadRecentMessages, listUserThreads, archiveThread } from '@/lib/conversation/thread-resolver'
import type { Channel } from '@/lib/conversation/types'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // Authenticate
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── Branch: list threads ───────────────────────────────────────────────
  if (searchParams.get('list') === 'threads') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No org found for user' }, { status: 400 })
    }

    const channel = searchParams.get('channel') as Channel | null
    const threads = await listUserThreads(supabase, user.id, profile.org_id, channel || undefined)
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

  if (thread.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load messages (returned newest-first, reverse for chronological display)
  const messages = await loadRecentMessages(supabase, threadId, limit)
  messages.reverse()

  return NextResponse.json({ threadId, messages })
}

export async function DELETE(request: NextRequest) {
  // Authenticate
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  const { threadId } = await request.json()
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  }

  // Verify the user owns this thread
  const { data: thread, error: fetchError } = await supabase
    .from('conversation_threads')
    .select('id, user_id')
    .eq('id', threadId)
    .single()

  if (fetchError || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  if (thread.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Archive the thread (userId check provides defense-in-depth)
  const archived = await archiveThread(supabase, threadId, user.id)
  if (!archived) {
    return NextResponse.json({ error: 'Failed to archive thread' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
