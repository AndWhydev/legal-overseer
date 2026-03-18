/**
 * Meeting Intelligence — Core Types
 *
 * Type definitions for meetings, transcripts, action items, and follow-ups.
 */

export type MeetingType = 'general' | 'standup' | 'client_call' | 'internal' | 'sales' | 'onboarding' | 'review'
export type MeetingStatus = 'pending' | 'recording' | 'transcribing' | 'processing' | 'completed' | 'failed'
export type MeetingSource = 'upload' | 'zoom' | 'google_meet' | 'teams' | 'manual'
export type SentimentLabel = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative'
export type ActionItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type FollowUpType = 'email' | 'whatsapp' | 'slack' | 'task'
export type FollowUpStatus = 'draft' | 'approved' | 'sent' | 'failed'
export type ParticipantRole = 'host' | 'attendee' | 'guest' | 'note_taker'

export interface Meeting {
  id: string
  org_id: string
  title: string
  description: string | null
  meeting_type: MeetingType
  status: MeetingStatus
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  source: MeetingSource
  source_meeting_id: string | null
  source_url: string | null
  recording_path: string | null
  recording_size_bytes: number | null
  recording_mime_type: string | null
  summary: string | null
  key_decisions: string[]
  sentiment_score: number | null
  sentiment_label: SentimentLabel | null
  contact_id: string | null
  project_id: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MeetingParticipant {
  id: string
  meeting_id: string
  org_id: string
  name: string
  email: string | null
  role: ParticipantRole
  speaker_label: string | null
  contact_id: string | null
  created_at: string
}

export interface TranscriptSegment {
  id: string
  meeting_id: string
  org_id: string
  segment_index: number
  speaker_label: string | null
  speaker_id: string | null
  start_time_ms: number
  end_time_ms: number
  text: string
  confidence: number | null
  language: string
  created_at: string
}

export interface MeetingActionItem {
  id: string
  meeting_id: string
  org_id: string
  title: string
  description: string | null
  assigned_to: string | null
  assigned_participant_id: string | null
  due_date: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: ActionItemStatus
  task_id: string | null
  source_segment_id: string | null
  source_quote: string | null
  confidence: number
  extraction_method: string
  created_at: string
  updated_at: string
}

export interface MeetingFollowUp {
  id: string
  meeting_id: string
  org_id: string
  follow_up_type: FollowUpType
  recipient_name: string | null
  recipient_email: string | null
  subject: string | null
  body: string
  status: FollowUpStatus
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Full meeting with all related data */
export interface MeetingWithDetails extends Meeting {
  participants: MeetingParticipant[]
  transcript_segments: TranscriptSegment[]
  action_items: MeetingActionItem[]
  follow_ups: MeetingFollowUp[]
}

/** Search result from transcript search */
export interface TranscriptSearchResult {
  meeting_id: string
  meeting_title: string
  segment_text: string
  speaker_label: string | null
  start_time_ms: number
  rank: number
}

/** AI extraction output from a transcript */
export interface MeetingExtraction {
  summary: string
  key_decisions: string[]
  action_items: ExtractedActionItem[]
  follow_up_email: ExtractedFollowUp | null
  sentiment: {
    score: number
    label: SentimentLabel
  }
  topics: string[]
}

export interface ExtractedActionItem {
  title: string
  description: string
  assigned_to: string | null
  due_date: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  source_quote: string
}

export interface ExtractedFollowUp {
  subject: string
  body: string
  recipients: string[]
}

/** Upload request for a meeting recording */
export interface MeetingUploadRequest {
  title: string
  meeting_type?: MeetingType
  description?: string
  contact_id?: string
  participants?: Array<{ name: string; email?: string; role?: ParticipantRole }>
  scheduled_at?: string
}

/** Transcription job status for polling */
export interface TranscriptionJob {
  meeting_id: string
  status: MeetingStatus
  progress: number // 0-100
  error?: string
}
