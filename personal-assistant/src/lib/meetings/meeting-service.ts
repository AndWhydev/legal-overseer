/**
 * Meeting Service — CRUD and query operations for meetings.
 *
 * All operations are org-scoped via RLS. Service-role client
 * should be used for background processing (transcription, extraction).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  Meeting,
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

export async function createMeeting(
  supabase: SupabaseClient,
  orgId: string,
  request: MeetingUploadRequest & { created_by?: string }
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      org_id: orgId,
      title: request.title,
      description: request.description || null,
      meeting_type: request.meeting_type || 'general',
      status: 'pending' as MeetingStatus,
      scheduled_at: request.scheduled_at || null,
      contact_id: request.contact_id || null,
      source: 'upload',
      created_by: request.created_by || null,
    })
    .select()
    .single()

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
  }

  return data as Meeting
}

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
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single()

  if (error || !meeting) {
    logger.error('[meeting-service] Failed to get meeting:', error?.message)
    return null
  }

  // Fetch related data in parallel
  const [participants, segments, actionItems, followUps] = await Promise.all([
    supabase
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true }),
    supabase
      .from('meeting_transcript_segments')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('segment_index', { ascending: true }),
    supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', meetingId)
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
}

export async function listMeetings(
  supabase: SupabaseClient,
  orgId: string,
  options?: {
    limit?: number
    offset?: number
    meeting_type?: MeetingType
    status?: MeetingStatus
    contact_id?: string
  }
): Promise<{ meetings: Meeting[]; total: number }> {
  let query = supabase
    .from('meetings')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

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
    return { meetings: [], total: 0 }
  }

  return {
    meetings: (data || []) as Meeting[],
    total: count ?? 0,
  }
}

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
    .select()
    .single()

  if (error) {
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

export async function searchTranscripts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
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
}
