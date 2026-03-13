import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

interface RestoreRequest {
  checkpoint_id: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: RestoreRequest = await request.json()
    if (!body.checkpoint_id) {
      return NextResponse.json(
        { error: 'checkpoint_id is required' },
        { status: 400 }
      )
    }

    // Verify thread belongs to user
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('id')
      .eq('id', params.threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Get checkpoint details
    const { data: checkpoint, error: checkpointError } = await supabase
      .from('conversation_checkpoints')
      .select('*')
      .eq('id', body.checkpoint_id)
      .eq('thread_id', params.threadId)
      .single()

    if (checkpointError || !checkpoint) {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })
    }

    // Soft-delete messages after checkpoint (set deleted_at timestamp)
    // First, check if conversation_messages has a deleted_at column
    const { data: messagesAfterCheckpoint, error: fetchError } = await supabase
      .from('conversation_messages')
      .select('id')
      .eq('thread_id', params.threadId)
      .gt('turn_number', checkpoint.message_index)
      .order('turn_number', { ascending: false })

    if (fetchError) {
      logger.error('Failed to fetch messages after checkpoint:', fetchError)
      return NextResponse.json(
        { error: 'Failed to restore checkpoint' },
        { status: 500 }
      )
    }

    // Delete messages after the checkpoint
    if (messagesAfterCheckpoint && messagesAfterCheckpoint.length > 0) {
      const messageIds = messagesAfterCheckpoint.map((m) => m.id)
      const { error: deleteError } = await supabase
        .from('conversation_messages')
        .delete()
        .in('id', messageIds)

      if (deleteError) {
        logger.error('Failed to delete messages:', deleteError)
        return NextResponse.json(
          { error: 'Failed to restore checkpoint' },
          { status: 500 }
        )
      }
    }

    // Update thread's last_activity_at
    const { error: updateThreadError } = await supabase
      .from('conversation_threads')
      .update({
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', params.threadId)

    if (updateThreadError) {
      logger.error('Failed to update thread:', updateThreadError)
      return NextResponse.json(
        { error: 'Failed to restore checkpoint' },
        { status: 500 }
      )
    }

    // Fetch and return the restored messages
    const { data: restoredMessages, error: fetchRestoredError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('thread_id', params.threadId)
      .order('turn_number', { ascending: true })

    if (fetchRestoredError) {
      logger.error('Failed to fetch restored messages:', fetchRestoredError)
      return NextResponse.json(
        { error: 'Failed to fetch restored messages' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      checkpoint,
      messages: restoredMessages || [],
      message: 'Conversation restored to checkpoint',
    })
  } catch (error) {
    logger.error('Restore POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
