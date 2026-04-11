import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeMeeting } from '@/lib/meetings/transcription-pipeline'
import { extractMeetingIntelligence } from '@/lib/meetings/action-extractor'
import { createTasksFromActionItems, getTranscriptSegments } from '@/lib/meetings/meeting-service'
import { draftFollowUpEmail, queueFollowUpEmail } from '@/lib/meetings/followup-drafter'
import type { MeetingParticipant, MeetingActionItem } from '@/lib/meetings/types'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/meetings/[id]/transcribe — Trigger transcription + intelligence extraction
 *
 * This is the main processing endpoint. It:
 * 1. Transcribes the recording via Whisper
 * 2. Extracts action items, summary, decisions, sentiment
 * 3. Creates kanban tasks from action items
 * 4. Drafts follow-up email and queues for approval
 * 5. Updates meeting status to 'ready'
 *
 * Note: This endpoint may take 30-120 seconds for long recordings.
 * In production, this should be triggered from a Fly.io worker,
 * not directly from the Vercel edge (30s timeout).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: meetingId } = await params
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })
  const orgId = profile.active_org_id

  // Verify meeting exists and has a recording
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  if (!meeting.recording_path) return NextResponse.json({ error: 'No recording uploaded' }, { status: 400 })
  if (['transcribing', 'processing'].includes(meeting.status)) {
    return NextResponse.json({ error: 'Already processing' }, { status: 409 })
  }

  try {
    // Step 1: Transcribe
    logger.info(`[meetings/transcribe] Starting transcription for meeting ${meetingId}`)
    await transcribeMeeting(supabase, meetingId, orgId, meeting.recording_path)

    // Step 2: Get stored segments for intelligence extraction
    const segments = await getTranscriptSegments(supabase, meetingId, orgId)

    // Step 3: Extract intelligence (action items, summary, sentiment)
    logger.info(`[meetings/transcribe] Extracting intelligence from ${segments.length} segments`)
    const intelligence = await extractMeetingIntelligence(supabase, meetingId, orgId, segments)

    // Step 4: Create kanban tasks from action items
    const tasksCreated = await createTasksFromActionItems(supabase, meetingId, orgId)

    // Step 5: Draft follow-up email
    let followUpApprovalId: string | null = null
    const { data: participants } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)

    const { data: actionItems } = await supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', meetingId)

    if (participants && participants.length > 0) {
      const updatedMeeting = { ...meeting, summary: intelligence.summary, key_decisions: intelligence.key_decisions }
      const draft = await draftFollowUpEmail(
        updatedMeeting,
        participants as MeetingParticipant[],
        (actionItems ?? []) as MeetingActionItem[],
      )
      if (draft.recipients.length > 0) {
        followUpApprovalId = await queueFollowUpEmail(supabase, orgId, meetingId, draft)
      }
    }

    // Step 6: Mark meeting as ready
    await supabase
      .from('meetings')
      .update({ status: 'ready' })
      .eq('id', meetingId)

    return NextResponse.json({
      success: true,
      segments_count: segments.length,
      action_items_count: intelligence.actions.length,
      tasks_created: tasksCreated,
      summary: intelligence.summary,
      sentiment: intelligence.sentiment,
      follow_up_approval_id: followUpApprovalId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error(`[meetings/transcribe] Pipeline failed for ${meetingId}:`, errorMsg)

    return NextResponse.json({ error: `Processing failed: ${errorMsg}` }, { status: 500 })
  }
}
