/**
<<<<<<< HEAD
 * Meeting Service — CRUD operations and orchestration
=======
 * Meeting Service — CRUD and query operations for meetings.
 *
 * All operations are org-scoped via RLS. Service-role client
 * should be used for background processing (transcription, extraction).
>>>>>>> v1.5-marketing-launch
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  Meeting,
<<<<<<< HEAD
  MeetingWithRelations,
  MeetingParticipant,
  MeetingActionItem,
  TranscriptSegment,
  MeetingSource,
} from './types'
import { ALLOWED_MIME_TYPES, MAX_RECORDING_SIZE } from './types'

// ============================================================================
// Create
// ============================================================================

export interface CreateMeetingInput {
  title: string
  description?: string
  source?: MeetingSource
  started_at?: string
  participants?: Array<{ display_name: string; email?: string; role?: string }>
  project_id?: string
  external_id?: string
  external_url?: string
}
=======
  MeetingWithDetails,
  MeetingParticipant,
  TranscriptSegment,
  MeetingActionItem,
  MeetingFollowUp,
  MeetingStatus,
  MeetingType,
  TranscriptSearchResult,
  MeetingUploadRequest,
} from './types'

// ── Create ──────────────────────────────────────────────────────────────────
>>>>>>> v1.5-marketing-launch

export async function createMeeting(
  supabase: SupabaseClient,
  orgId: string,
<<<<<<< HEAD
  input: CreateMeetingInput,
): Promise<Meeting> {
=======
  request: MeetingUploadRequest & { created_by?: string }
): Promise<Meeting | null> {
>>>>>>> v1.5-marketing-launch
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      org_id: orgId,
<<<<<<< HEAD
      title: input.title,
      description: input.description ?? null,
      source: input.source ?? 'upload',
      status: 'uploading',
      started_at: input.started_at ?? null,
      project_id: input.project_id ?? null,
      external_id: input.external_id ?? null,
      external_url: input.external_url ?? null,
=======
      title: request.title,
      description: request.description || null,
      meeting_type: request.meeting_type || 'general',
      status: 'pending' as MeetingStatus,
      scheduled_at: request.scheduled_at || null,
      contact_id: request.contact_id || null,
      source: 'upload',
      created_by: request.created_by || null,
>>>>>>> v1.5-marketing-launch
    })
    .select()
    .single()

<<<<<<< HEAD
  if (error) throw new Error(`Failed to create meeting: ${error.message}`)

  // Add participants if provided
  if (input.participants && input.participants.length > 0) {
    const participantRows = input.participants.map(p => ({
      meeting_id: data.id,
      org_id: orgId,
      display_name: p.display_name,
      email: p.email ?? null,
      role: p.role ?? 'attendee',
    }))

    await supabase.from('meeting_participants').insert(participantRows)
=======
  if (error) {
    logger.error('[meeting-service] Failed to create meeting:', error.message)
    return null
  }

  // Insert participants if provided
  if (request.participants && request.participants.length > 0) {
    const participantRows = request.participants.map(p => ({
      meeting_id: data.id,
      org_id: orgId,
      name: p.name,
      email: p.email || null,
      role: p.role || 'attendee',
    }))

    const { error: pErr } = await supabase
      .from('meeting_participants')
      .insert(participantRows)

    if (pErr) {
      logger.warn('[meeting-service] Failed to insert participants:', pErr.message)
    }
>>>>>>> v1.5-marketing-launch
  }

  return data as Meeting
}

<<<<<<< HEAD
// ============================================================================
// Upload recording
// ============================================================================

export async function uploadRecording(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  file: File | Blob,
  mimeType: string,
): Promise<string> {
  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`)
  }

  // Validate size
  if (file.size > MAX_RECORDING_SIZE) {
    throw new Error(`File exceeds 500MB limit: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
  }

  const ext = getExtensionFromMime(mimeType)
  const storagePath = `${orgId}/${meetingId}/recording.${ext}`

  const { error: uploadError } = await supabase
    .storage
    .from('meetings')
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  // Update meeting record with recording info
  await supabase
    .from('meetings')
    .update({
      recording_path: storagePath,
      recording_mime_type: mimeType,
      recording_size_bytes: file.size,
      status: 'uploaded',
    })
    .eq('id', meetingId)

  logger.info(`[meeting-service] Recording uploaded: ${storagePath} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`)
  return storagePath
}

// ============================================================================
// Read
// ============================================================================

export async function getMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
): Promise<MeetingWithRelations | null> {
=======
// ── Read ────────────────────────────────────────────────────────────────────

export async function getMeeting(
  supabase: SupabaseClient,
  meetingId: string
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single()

  if (error) {
    logger.error('[meeting-service] Failed to get meeting:', error.message)
    return null
  }
  return data as Meeting
}

export async function getMeetingWithDetails(
  supabase: SupabaseClient,
  meetingId: string
): Promise<MeetingWithDetails | null> {
>>>>>>> v1.5-marketing-launch
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
<<<<<<< HEAD
    .eq('org_id', orgId)
    .single()

  if (error || !meeting) return null

  // Fetch participants and action items in parallel
  const [participantsRes, actionItemsRes, segmentCountRes] = await Promise.all([
=======
    .single()

  if (error || !meeting) {
    logger.error('[meeting-service] Failed to get meeting:', error?.message)
    return null
  }

  // Fetch related data in parallel
  const [participants, segments, actionItems, followUps] = await Promise.all([
>>>>>>> v1.5-marketing-launch
    supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
<<<<<<< HEAD
      .order('created_at'),
=======
      .order('created_at', { ascending: true }),
    supabase
      .from('meeting_transcript_segments')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('segment_index', { ascending: true }),
>>>>>>> v1.5-marketing-launch
    supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', meetingId)
<<<<<<< HEAD
      .order('created_at'),
    supabase
      .from('transcript_segments')
      .select('id', { count: 'exact', head: true })
      .eq('meeting_id', meetingId),
  ])

  return {
    ...meeting,
    participants: (participantsRes.data ?? []) as MeetingParticipant[],
    action_items: (actionItemsRes.data ?? []) as MeetingActionItem[],
    segment_count: segmentCountRes.count ?? 0,
  } as MeetingWithRelations
=======
      .order('created_at', { ascending: true }),
    supabase
      .from('meeting_follow_ups')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true }),
  ])

  return {
    ...(meeting as Meeting),
    participants: (participants.data || []) as MeetingParticipant[],
    transcript_segments: (segments.data || []) as TranscriptSegment[],
    action_items: (actionItems.data || []) as MeetingActionItem[],
    follow_ups: (followUps.data || []) as MeetingFollowUp[],
  }
>>>>>>> v1.5-marketing-launch
}

export async function listMeetings(
  supabase: SupabaseClient,
  orgId: string,
  options?: {
    limit?: number
    offset?: number
<<<<<<< HEAD
    status?: string
    search?: string
    project_id?: string
    contact_id?: string
  },
=======
    meeting_type?: MeetingType
    status?: MeetingStatus
    contact_id?: string
  }
>>>>>>> v1.5-marketing-launch
): Promise<{ meetings: Meeting[]; total: number }> {
  let query = supabase
    .from('meetings')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

<<<<<<< HEAD
  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.project_id) {
    query = query.eq('project_id', options.project_id)
  }
  if (options?.search) {
    query = query.textSearch('search_vector', options.search)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1)
  }

  const { data, count, error } = await query

  if (error) {
    logger.error('[meeting-service] List meetings failed:', error.message)
=======
  if (options?.meeting_type) {
    query = query.eq('meeting_type', options.meeting_type)
  }
  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.contact_id) {
    query = query.eq('contact_id', options.contact_id)
  }

  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    logger.error('[meeting-service] Failed to list meetings:', error.message)
>>>>>>> v1.5-marketing-launch
    return { meetings: [], total: 0 }
  }

  return {
<<<<<<< HEAD
    meetings: (data ?? []) as Meeting[],
=======
    meetings: (data || []) as Meeting[],
>>>>>>> v1.5-marketing-launch
    total: count ?? 0,
  }
}

<<<<<<< HEAD
export async function getTranscriptSegments(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  options?: { limit?: number; offset?: number },
): Promise<TranscriptSegment[]> {
  let query = supabase
    .from('transcript_segments')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('org_id', orgId)
    .order('segment_index')

  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1)

  const { data, error } = await query

  if (error) {
    logger.error('[meeting-service] Get segments failed:', error.message)
    return []
  }

  return (data ?? []) as TranscriptSegment[]
}

// ============================================================================
// Update
// ============================================================================

export async function updateMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  updates: Partial<Pick<Meeting, 'title' | 'description' | 'started_at' | 'project_id'>>,
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    logger.error('[meeting-service] Update meeting failed:', error.message)
    return null
  }

  return data as Meeting
}

export async function updateActionItem(
  supabase: SupabaseClient,
  actionItemId: string,
  orgId: string,
  updates: Partial<Pick<MeetingActionItem, 'status' | 'title' | 'assignee_name' | 'due_date' | 'priority'>>,
): Promise<MeetingActionItem | null> {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .update(updates)
    .eq('id', actionItemId)
    .eq('org_id', orgId)
=======
// ── Update ──────────────────────────────────────────────────────────────────

export async function updateMeetingStatus(
  supabase: SupabaseClient,
  meetingId: string,
  status: MeetingStatus,
  extras?: Partial<Meeting>
): Promise<boolean> {
  const { error } = await supabase
    .from('meetings')
    .update({ status, ...extras })
    .eq('id', meetingId)

  if (error) {
    logger.error('[meeting-service] Failed to update meeting status:', error.message)
    return false
  }
  return true
}

export async function updateMeetingSummary(
  supabase: SupabaseClient,
  meetingId: string,
  summary: string,
  keyDecisions: string[],
  sentimentScore: number,
  sentimentLabel: string
): Promise<boolean> {
  const { error } = await supabase
    .from('meetings')
    .update({
      summary,
      key_decisions: keyDecisions,
      sentiment_score: sentimentScore,
      sentiment_label: sentimentLabel,
      status: 'completed' as MeetingStatus,
    })
    .eq('id', meetingId)

  if (error) {
    logger.error('[meeting-service] Failed to update meeting summary:', error.message)
    return false
  }
  return true
}

// ── Transcript Segments ─────────────────────────────────────────────────────

export async function insertTranscriptSegments(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  segments: Array<{
    segment_index: number
    speaker_label?: string
    speaker_id?: string
    start_time_ms: number
    end_time_ms: number
    text: string
    confidence?: number
    language?: string
  }>
): Promise<boolean> {
  if (segments.length === 0) return true

  const rows = segments.map(s => ({
    meeting_id: meetingId,
    org_id: orgId,
    segment_index: s.segment_index,
    speaker_label: s.speaker_label || null,
    speaker_id: s.speaker_id || null,
    start_time_ms: s.start_time_ms,
    end_time_ms: s.end_time_ms,
    text: s.text,
    confidence: s.confidence ?? null,
    language: s.language || 'en',
  }))

  // Insert in batches of 100 to avoid payload limits
  const BATCH_SIZE = 100
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('meeting_transcript_segments')
      .insert(batch)

    if (error) {
      logger.error('[meeting-service] Failed to insert transcript segments:', error.message)
      return false
    }
  }

  return true
}

// ── Action Items ────────────────────────────────────────────────────────────

export async function insertActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  items: Array<{
    title: string
    description?: string
    assigned_to?: string
    due_date?: string
    priority?: string
    source_quote?: string
    confidence?: number
  }>
): Promise<MeetingActionItem[]> {
  if (items.length === 0) return []

  const rows = items.map(item => ({
    meeting_id: meetingId,
    org_id: orgId,
    title: item.title,
    description: item.description || null,
    assigned_to: item.assigned_to || null,
    due_date: item.due_date || null,
    priority: item.priority || 'medium',
    source_quote: item.source_quote || null,
    confidence: item.confidence ?? 0.8,
    extraction_method: 'ai',
  }))

  const { data, error } = await supabase
    .from('meeting_action_items')
    .insert(rows)
    .select()

  if (error) {
    logger.error('[meeting-service] Failed to insert action items:', error.message)
    return []
  }

  return (data || []) as MeetingActionItem[]
}

export async function updateActionItemStatus(
  supabase: SupabaseClient,
  actionItemId: string,
  status: string,
  taskId?: string
): Promise<boolean> {
  const update: Record<string, unknown> = { status }
  if (taskId) update.task_id = taskId

  const { error } = await supabase
    .from('meeting_action_items')
    .update(update)
    .eq('id', actionItemId)

  if (error) {
    logger.error('[meeting-service] Failed to update action item:', error.message)
    return false
  }
  return true
}

// ── Follow-Ups ──────────────────────────────────────────────────────────────

export async function insertFollowUp(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  followUp: {
    follow_up_type?: string
    recipient_name?: string
    recipient_email?: string
    subject?: string
    body: string
  }
): Promise<MeetingFollowUp | null> {
  const { data, error } = await supabase
    .from('meeting_follow_ups')
    .insert({
      meeting_id: meetingId,
      org_id: orgId,
      follow_up_type: followUp.follow_up_type || 'email',
      recipient_name: followUp.recipient_name || null,
      recipient_email: followUp.recipient_email || null,
      subject: followUp.subject || null,
      body: followUp.body,
    })
>>>>>>> v1.5-marketing-launch
    .select()
    .single()

  if (error) {
<<<<<<< HEAD
    logger.error('[meeting-service] Update action item failed:', error.message)
    return null
  }

  return data as MeetingActionItem
}

export async function updateSpeakerName(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  speakerLabel: string,
  speakerName: string,
): Promise<void> {
  await supabase
    .from('transcript_segments')
    .update({ speaker_name: speakerName })
    .eq('meeting_id', meetingId)
    .eq('org_id', orgId)
    .eq('speaker_label', speakerLabel)
}

// ============================================================================
// Delete
// ============================================================================

export async function deleteMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
): Promise<boolean> {
  // Delete storage files
  const { data: meeting } = await supabase
    .from('meetings')
    .select('recording_path')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .single()

  if (meeting?.recording_path) {
    await supabase.storage.from('meetings').remove([meeting.recording_path])
  }

  // Delete meeting (cascades to participants, segments, action items)
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meetingId)
    .eq('org_id', orgId)

  return !error
}

// ============================================================================
// Search
// ============================================================================
=======
    logger.error('[meeting-service] Failed to insert follow-up:', error.message)
    return null
  }

  return data as MeetingFollowUp
}

export async function approveFollowUp(
  supabase: SupabaseClient,
  followUpId: string,
  approvedBy: string
): Promise<boolean> {
  const { error } = await supabase
    .from('meeting_follow_ups')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', followUpId)

  if (error) {
    logger.error('[meeting-service] Failed to approve follow-up:', error.message)
    return false
  }
  return true
}

// ── Search ──────────────────────────────────────────────────────────────────
>>>>>>> v1.5-marketing-launch

export async function searchTranscripts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
<<<<<<< HEAD
  options?: { limit?: number; meeting_id?: string },
): Promise<Array<TranscriptSegment & { meeting_title: string }>> {
  // Use full-text search on transcript segments
  let dbQuery = supabase
    .from('transcript_segments')
    .select('*, meetings!inner(title)')
    .eq('org_id', orgId)
    .textSearch('search_vector', query)
    .order('start_seconds')
    .limit(options?.limit ?? 20)

  if (options?.meeting_id) {
    dbQuery = dbQuery.eq('meeting_id', options.meeting_id)
  }

  const { data, error } = await dbQuery

  if (error) {
    logger.error('[meeting-service] Search transcripts failed:', error.message)
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    meeting_title: (row.meetings as { title: string })?.title ?? 'Unknown',
  })) as Array<TranscriptSegment & { meeting_title: string }>
}

// ============================================================================
// Task Integration
// ============================================================================

export async function createTasksFromActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
): Promise<number> {
  // Get action items without linked tasks
  const { data: items } = await supabase
    .from('meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('org_id', orgId)
    .is('task_id', null)
    .eq('status', 'pending')

  if (!items || items.length === 0) return 0

  // Get meeting title for context
  const { data: meeting } = await supabase
    .from('meetings')
    .select('title')
    .eq('id', meetingId)
    .single()

  let created = 0

  for (const item of items) {
    // Resolve column ID for "To Do"
    const { data: columns } = await supabase
      .from('kanban_columns')
      .select('id')
      .eq('org_id', orgId)
      .ilike('title', '%to do%')
      .limit(1)

    const columnId = columns?.[0]?.id ?? null

    // Create kanban task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        org_id: orgId,
        title: item.title,
        description: `${item.description ?? ''}\n\n---\nFrom meeting: ${meeting?.title ?? 'Unknown'}\nSource: "${item.source_text ?? ''}"`,
        priority: item.priority ?? 'medium',
        status: 'pending',
        column_id: columnId,
        metadata: {
          source: 'meeting',
          meeting_id: meetingId,
          action_item_id: item.id,
        },
      })
      .select()
      .single()

    if (!error && task) {
      // Link task back to action item
      await supabase
        .from('meeting_action_items')
        .update({ task_id: task.id })
        .eq('id', item.id)

      created++
    }
  }

  logger.info(`[meeting-service] Created ${created} tasks from meeting ${meetingId} action items`)
  return created
}

// ============================================================================
// Helpers
// ============================================================================

function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'wav'
  if (mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('quicktime')) return 'mov'
  return 'mp3'
=======
  limit: number = 20
): Promise<TranscriptSearchResult[]> {
  const { data, error } = await supabase
    .rpc('search_meeting_transcripts', {
      p_org_id: orgId,
      p_query: query,
      p_limit: limit,
    })

  if (error) {
    logger.error('[meeting-service] Transcript search failed:', error.message)
    return []
  }

  return (data || []) as TranscriptSearchResult[]
}

// ── Recording Storage ───────────────────────────────────────────────────────

export async function uploadRecording(
  supabase: SupabaseClient,
  orgId: string,
  meetingId: string,
  file: Buffer | Uint8Array,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const storagePath = `meetings/${orgId}/${meetingId}/${fileName}`

  const { error } = await supabase.storage
    .from('recordings')
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) {
    logger.error('[meeting-service] Failed to upload recording:', error.message)
    return null
  }

  // Update meeting record with storage path
  await supabase
    .from('meetings')
    .update({
      recording_path: storagePath,
      recording_size_bytes: file.length,
      recording_mime_type: mimeType,
    })
    .eq('id', meetingId)

  return storagePath
}

export async function getRecordingUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(storagePath, expiresIn)

  if (error) {
    logger.error('[meeting-service] Failed to get recording URL:', error.message)
    return null
  }

  return data?.signedUrl ?? null
>>>>>>> v1.5-marketing-launch
}
