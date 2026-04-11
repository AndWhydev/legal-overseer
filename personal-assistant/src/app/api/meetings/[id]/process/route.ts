import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMeeting } from '@/lib/meetings/meeting-service'
import { runTranscriptionPipeline } from '@/lib/meetings/transcription-pipeline'
import { runExtractionPipeline, convertActionItemsToTasks, buildTranscriptText } from '@/lib/meetings/ai-extraction'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/meetings/[id]/process — Trigger transcription + AI extraction.
 *
 * This runs the full pipeline:
 * 1. Transcribe the recording via Whisper
 * 2. Extract action items, summary, sentiment via Claude
 * 3. Optionally convert action items to kanban tasks
 *
 * Body (optional): { create_tasks?: boolean }
 *
 * NOTE: This can take 30-120+ seconds depending on recording length.
 * For production use, this should be dispatched to a Fly.io worker.
 * The Vercel 30s timeout will apply; for long recordings, use the
 * worker endpoint instead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: meetingId } = await params
  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  // Parse optional body
  let createTasks = true
  try {
    const body = await request.json()
    if (body.create_tasks === false) createTasks = false
  } catch {
    // No body is fine
  }

  // Validate meeting exists and is in a processable state
  const meeting = await getMeeting(supabase, meetingId)
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }
  if (meeting.org_id !== orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (!meeting.recording_path) {
    return NextResponse.json({ error: 'No recording attached to this meeting' }, { status: 400 })
  }
  if (meeting.status === 'transcribing' || meeting.status === 'processing') {
    return NextResponse.json({ error: 'Meeting is already being processed' }, { status: 409 })
  }

  logger.info('[meetings/process] Starting pipeline for:', meetingId)

  // Step 1: Transcription
  const transcriptionResult = await runTranscriptionPipeline(
    supabase,
    meetingId,
    orgId
  )

  if (!transcriptionResult.success) {
    return NextResponse.json({
      error: 'Transcription failed',
      details: transcriptionResult.error,
    }, { status: 500 })
  }

  // Step 2: Get participants for extraction context
  const { data: participants } = await supabase
    .from('meeting_participants')
    .select('*')
    .eq('meeting_id', meetingId)

  // Step 3: Get transcript segments for extraction
  const { data: segments } = await supabase
    .from('meeting_transcript_segments')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('segment_index', { ascending: true })

  const transcriptText = segments
    ? buildTranscriptText(segments, { includeSpeakers: true })
    : transcriptionResult.fullText

  // Step 4: AI Extraction
  const extractionResult = await runExtractionPipeline(
    supabase,
    meetingId,
    orgId,
    transcriptText,
    participants || [],
    meeting.title,
    meeting.meeting_type
  )

  // Step 5: Convert action items to kanban tasks (if requested)
  let tasksCreated = 0
  if (createTasks && extractionResult.success) {
    tasksCreated = await convertActionItemsToTasks(
      supabase,
      orgId,
      meetingId,
      meeting.title
    )
  }

  logger.info('[meetings/process] Pipeline complete:', {
    meetingId,
    transcription: {
      segments: transcriptionResult.segmentCount,
      duration: transcriptionResult.durationSeconds,
    },
    extraction: {
      actionItems: extractionResult.actionItemCount,
      followUp: extractionResult.followUpCreated,
    },
    tasksCreated,
  })

  return NextResponse.json({
    success: true,
    meeting_id: meetingId,
    transcription: {
      segments: transcriptionResult.segmentCount,
      duration_seconds: transcriptionResult.durationSeconds,
    },
    extraction: {
      action_items: extractionResult.actionItemCount,
      follow_up_created: extractionResult.followUpCreated,
      tasks_created: tasksCreated,
    },
  })
}
