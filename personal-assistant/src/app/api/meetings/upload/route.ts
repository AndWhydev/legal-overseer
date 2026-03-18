import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMeeting, uploadRecording } from '@/lib/meetings/meeting-service'
import { isSupportedMimeType } from '@/lib/meetings/transcription-pipeline'
import { logger } from '@/lib/core/logger'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB

/**
 * POST /api/meetings/upload — Upload a meeting recording.
 *
 * Accepts multipart/form-data with:
 * - file: audio/video file
 * - title: meeting title
 * - meeting_type: optional meeting type
 * - description: optional description
 * - contact_id: optional contact ID
 * - participants: optional JSON array of participant objects
 *
 * Creates the meeting record, uploads the file to Supabase Storage,
 * and returns the meeting ID for subsequent processing.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const title = formData.get('title') as string | null

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Validate file
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 500MB limit' }, { status: 400 })
  }

  const mimeType = file.type || 'audio/mpeg'
  if (!isSupportedMimeType(mimeType)) {
    return NextResponse.json({
      error: `Unsupported file type: ${mimeType}. Supported: audio (mp3, wav, m4a, ogg, webm, flac) and video (mp4, webm, mov)`,
    }, { status: 400 })
  }

  // Parse optional participants JSON
  let participants: Array<{ name: string; email?: string; role?: string }> = []
  const participantsStr = formData.get('participants') as string | null
  if (participantsStr) {
    try {
      participants = JSON.parse(participantsStr)
    } catch {
      logger.warn('[meetings/upload] Invalid participants JSON, ignoring')
    }
  }

  // 1. Create meeting record
  const meetingTypeRaw = formData.get('meeting_type') as string | null
  const validMeetingTypes = ['general', 'standup', 'client_call', 'internal', 'sales', 'onboarding', 'review'] as const
  type MT = typeof validMeetingTypes[number]
  const meetingTypeValue: MT | undefined = meetingTypeRaw && validMeetingTypes.includes(meetingTypeRaw as MT)
    ? (meetingTypeRaw as MT)
    : undefined

  const validRoles = ['host', 'attendee', 'guest', 'note_taker'] as const
  type PR = typeof validRoles[number]
  const typedParticipants = participants.map(p => ({
    name: p.name,
    email: p.email || undefined,
    role: (p.role && validRoles.includes(p.role as PR) ? p.role as PR : undefined),
  }))

  const meeting = await createMeeting(supabase, orgId, {
    title,
    meeting_type: meetingTypeValue,
    description: (formData.get('description') as string) || undefined,
    contact_id: (formData.get('contact_id') as string) || undefined,
    participants: typedParticipants,
    created_by: user.id,
  })

  if (!meeting) {
    return NextResponse.json({ error: 'Failed to create meeting record' }, { status: 500 })
  }

  // 2. Upload file to Supabase Storage
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const fileName = file.name || `recording.${getExtFromMime(mimeType)}`

  const storagePath = await uploadRecording(
    supabase,
    orgId,
    meeting.id,
    fileBuffer,
    mimeType,
    fileName
  )

  if (!storagePath) {
    // Clean up the meeting record
    await supabase.from('meetings').delete().eq('id', meeting.id)
    return NextResponse.json({ error: 'Failed to upload recording' }, { status: 500 })
  }

  logger.info('[meetings/upload] Recording uploaded:', {
    meetingId: meeting.id,
    storagePath,
    size: fileBuffer.length,
    mimeType,
  })

  return NextResponse.json({
    meeting_id: meeting.id,
    status: 'pending',
    message: 'Recording uploaded. Call POST /api/meetings/[id]/process to start transcription.',
  }, { status: 201 })
}

function getExtFromMime(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('quicktime')) return 'mov'
  return 'mp3'
}
