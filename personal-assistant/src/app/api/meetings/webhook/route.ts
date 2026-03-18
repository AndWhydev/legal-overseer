import { NextResponse } from 'next/server'
import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'
import { createMeeting } from '@/lib/meetings/meeting-service'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/meetings/webhook — Receive Zoom/Google Meet recording webhooks
 *
 * Zoom: sends `recording.completed` event with download URLs
 * Google Meet: sends recording available notification
 *
 * This creates a meeting record and stores webhook payload.
 * Transcription is triggered separately (manually or via cron).
 */
export async function POST(request: Request) {
  const body = await request.json()

  // Verify webhook secret
  const secret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization')
  if (secret !== `Bearer ${process.env.MEETINGS_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isServiceClientConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const supabase = getServiceClient()

  try {
    // Detect webhook source
    if (body.event === 'recording.completed' && body.payload?.object) {
      // Zoom webhook
      return handleZoomWebhook(supabase, body)
    } else if (body.conferenceRecords || body.name?.startsWith('conferenceRecords/')) {
      // Google Meet webhook
      return handleGoogleMeetWebhook(supabase, body)
    } else {
      logger.warn('[meetings/webhook] Unknown webhook format:', JSON.stringify(body).slice(0, 200))
      return NextResponse.json({ error: 'Unknown webhook format' }, { status: 400 })
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[meetings/webhook] Webhook processing failed:', errorMsg)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleZoomWebhook(supabase: any, body: any) {
  const meetingData = body.payload.object
  const recordings = meetingData.recording_files ?? []

  // Find the audio recording (prefer audio-only over video for transcription)
  const audioRecording = recordings.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => r.recording_type === 'audio_only' || r.file_type === 'M4A'
  ) || recordings[0]

  if (!audioRecording) {
    return NextResponse.json({ message: 'No recordings found' }, { status: 200 })
  }

  // Determine org_id from webhook config or default
  const orgId = process.env.DEFAULT_ORG_ID
  if (!orgId) {
    return NextResponse.json({ error: 'DEFAULT_ORG_ID not configured' }, { status: 500 })
  }

  // Extract participants
  const participants = (meetingData.participants ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => ({
      display_name: p.name ?? p.user_name ?? 'Unknown',
      email: p.email ?? null,
    })
  )

  const meeting = await createMeeting(supabase, orgId, {
    title: meetingData.topic ?? 'Zoom Meeting',
    source: 'zoom',
    started_at: meetingData.start_time,
    external_id: String(meetingData.id),
    external_url: meetingData.share_url ?? null,
    participants,
  })

  // Store webhook payload for later processing
  await supabase
    .from('meetings')
    .update({
      status: 'uploaded',
      webhook_payload: body.payload,
      recording_mime_type: audioRecording.file_type === 'M4A' ? 'audio/m4a' : 'video/mp4',
      duration_seconds: meetingData.duration ? meetingData.duration * 60 : null,
      metadata: {
        zoom_download_url: audioRecording.download_url,
        zoom_download_token: body.download_token,
        zoom_recording_id: audioRecording.id,
      },
    })
    .eq('id', meeting!.id)

  logger.info(`[meetings/webhook] Zoom meeting created: ${meeting!.id} (${meetingData.topic})`)

  return NextResponse.json({
    success: true,
    meeting_id: meeting!.id,
    message: 'Meeting created from Zoom webhook',
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGoogleMeetWebhook(supabase: any, body: any) {
  const orgId = process.env.DEFAULT_ORG_ID
  if (!orgId) {
    return NextResponse.json({ error: 'DEFAULT_ORG_ID not configured' }, { status: 500 })
  }

  const conferenceRecord = body.conferenceRecords?.[0] ?? body
  const participants = (conferenceRecord.participants ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => ({
      display_name: p.displayName ?? 'Unknown',
      email: p.email ?? null,
    })
  )

  const meeting = await createMeeting(supabase, orgId, {
    title: conferenceRecord.name ?? 'Google Meet',
    source: 'google_meet',
    started_at: conferenceRecord.startTime,
    external_id: conferenceRecord.conferenceId ?? conferenceRecord.name,
    external_url: conferenceRecord.conferenceUri ?? null,
    participants,
  })

  await supabase
    .from('meetings')
    .update({
      status: 'uploaded',
      webhook_payload: body,
      metadata: {
        google_meet_recording_url: conferenceRecord.recordings?.[0]?.driveUri ?? null,
      },
    })
    .eq('id', meeting!.id)

  logger.info(`[meetings/webhook] Google Meet created: ${meeting!.id}`)

  return NextResponse.json({
    success: true,
    meeting_id: meeting!.id,
    message: 'Meeting created from Google Meet webhook',
  })
}
