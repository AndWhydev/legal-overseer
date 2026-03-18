/**
 * Meeting Service — CRUD operations and orchestration
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  Meeting,
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

export async function createMeeting(
  supabase: SupabaseClient,
  orgId: string,
  input: CreateMeetingInput,
): Promise<Meeting> {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      org_id: orgId,
      title: input.title,
      description: input.description ?? null,
      source: input.source ?? 'upload',
      status: 'uploading',
      started_at: input.started_at ?? null,
      project_id: input.project_id ?? null,
      external_id: input.external_id ?? null,
      external_url: input.external_url ?? null,
    })
    .select()
    .single()

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
  }

  return data as Meeting
}

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
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .single()

  if (error || !meeting) return null

  // Fetch participants and action items in parallel
  const [participantsRes, actionItemsRes, segmentCountRes] = await Promise.all([
    supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at'),
    supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', meetingId)
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
}

export async function listMeetings(
  supabase: SupabaseClient,
  orgId: string,
  options?: {
    limit?: number
    offset?: number
    status?: string
    search?: string
    project_id?: string
    contact_id?: string
  },
): Promise<{ meetings: Meeting[]; total: number }> {
  let query = supabase
    .from('meetings')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

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
    return { meetings: [], total: 0 }
  }

  return {
    meetings: (data ?? []) as Meeting[],
    total: count ?? 0,
  }
}

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
    .select()
    .single()

  if (error) {
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

export async function searchTranscripts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
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
}
