import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the most recently active thread
    const { data: thread, error: threadError } = await supabase
      .from('conversation_threads')
      .select(
        `
        id,
        title,
        last_activity_at,
        last_channel,
        message_count
      `
      )
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single()

    if (threadError) {
      if (threadError.code === 'PGRST116') {
        // No rows returned - this is normal for a new user
        return NextResponse.json({
          thread: null,
          message: 'No active conversations',
        })
      }
      logger.error('Failed to fetch recent thread:', threadError)
      return NextResponse.json(
        { error: 'Failed to fetch conversation' },
        { status: 500 }
      )
    }

    if (!thread) {
      return NextResponse.json({
        thread: null,
        message: 'No active conversations',
      })
    }

    // Get the last message as preview
    const { data: lastMessage, error: messageError } = await supabase
      .from('conversation_messages')
      .select('id, content, role, created_at')
      .eq('thread_id', thread.id)
      .order('turn_number', { ascending: false })
      .limit(1)
      .single()

    if (messageError && messageError.code !== 'PGRST116') {
      logger.error('Failed to fetch last message:', messageError)
    }

    return NextResponse.json({
      thread: {
        ...thread,
        lastMessage: lastMessage || null,
      },
    })
  } catch (error) {
    logger.error('Recent conversations GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
