import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadRecentMessages } from '@/lib/conversation/thread-resolver'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const threadId = searchParams.get('threadId')

  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  }

  const limitParam = searchParams.get('limit')
  const limit = Math.min(
    Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  )

  // Authenticate
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // Load messages
  const messages = await loadRecentMessages(supabase, threadId, limit)

  return NextResponse.json({ threadId, messages })
}
