import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

interface CheckpointRequest {
  message_index: number
  label?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify thread belongs to user
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Fetch checkpoints ordered by message_index
    const { data: checkpoints, error } = await supabase
      .from('conversation_checkpoints')
      .select('*')
      .eq('thread_id', threadId)
      .order('message_index', { ascending: true })

    if (error) {
      logger.error('Failed to fetch checkpoints:', error)
      return NextResponse.json(
        { error: 'Failed to fetch checkpoints' },
        { status: 500 }
      )
    }

    return NextResponse.json({ checkpoints: checkpoints || [] })
  } catch (error) {
    logger.error('Checkpoints GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CheckpointRequest = await request.json()
    if (typeof body.message_index !== 'number') {
      return NextResponse.json(
        { error: 'message_index is required and must be a number' },
        { status: 400 }
      )
    }

    // Verify thread belongs to user
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Create checkpoint
    const { data: checkpoint, error } = await supabase
      .from('conversation_checkpoints')
      .insert({
        thread_id: threadId,
        user_id: user.id,
        message_index: body.message_index,
        label: body.label || 'Checkpoint',
        metadata: {},
      })
      .select()
      .single()

    if (error) {
      logger.error('Failed to create checkpoint:', error)
      return NextResponse.json(
        { error: 'Failed to create checkpoint' },
        { status: 500 }
      )
    }

    return NextResponse.json(checkpoint, { status: 201 })
  } catch (error) {
    logger.error('Checkpoints POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
