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

    // Fetch up to 20 recent active threads
    let threads: Array<{
      id: string
      title: string | null
      last_activity_at: string
      message_count: number
      status: string
    }> = []

    try {
      const { data, error } = await supabase
        .from('conversation_threads')
        .select('id, title, last_activity_at, message_count, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('last_activity_at', { ascending: false })
        .limit(20)

      if (error) {
        const msg = error.message || ''
        // Table may not exist yet
        if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
          return NextResponse.json({ threads: [] })
        }
        logger.error('Failed to fetch threads:', error)
        return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 })
      }

      threads = data || []
    } catch {
      // Table not available
      return NextResponse.json({ threads: [] })
    }

    if (threads.length === 0) {
      return NextResponse.json({ threads: [] })
    }

    // Fetch last message preview for each thread in parallel
    const threadsWithPreviews = await Promise.all(
      threads.map(async (thread) => {
        let preview: string | null = null
        try {
          const { data: lastMsg } = await supabase
            .from('conversation_messages')
            .select('content, role')
            .eq('thread_id', thread.id)
            .order('turn_number', { ascending: false })
            .limit(1)
            .single()

          if (lastMsg?.content) {
            preview = lastMsg.content.slice(0, 100)
          }
        } catch {
          // Preview is optional
        }

        return {
          id: thread.id,
          title: thread.title,
          lastActivity: thread.last_activity_at,
          messageCount: thread.message_count,
          preview,
        }
      })
    )

    return NextResponse.json({ threads: threadsWithPreviews })
  } catch (error) {
    logger.error('Conversations list GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
