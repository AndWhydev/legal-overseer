/**
 * Meeting Intelligence — Type Definitions
 */

export type MeetingStatus = 'uploading' | 'uploaded' | 'transcribing' | 'transcribed' | 'processing' | 'ready' | 'failed'
export type MeetingSource = 'upload' | 'zoom' | 'google_meet' | 'teams' | 'other'
export type ActionItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Meeting {
  id: string
  org_id: string
  title: string
  description: string | null
  source: MeetingSource
  status: MeetingStatus
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  recording_path: string | null
  recording_mime_type: string | null
  recording_size_bytes: number | null
  summary: string | null
  key_decisions: string[]
  sentiment_score: number | null
  sentiment_label: string | null
  project_id: string | null
  external_id: string | null
  external_url: string | null
  metadata: Record<string, unknown>
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface MeetingParticipant {
  id: string
  meeting_id: string
  org_id: string
  display_name: string
  email: string | null
  speaker_label: string | null
  contact_id: string | null
  role: string
  created_at: string
}

export interface TranscriptSegment {
  id: string
  meeting_id: string
  org_id: string
  segment_index: number
  text: string
  speaker_label: string | null
  speaker_name: string | null
  start_seconds: number
  end_seconds: number
  is_actionable: boolean
  sentiment_score: number | null
  confidence: number | null
  language: string | null
  created_at: string
}

export interface MeetingActionItem {
  id: string
  meeting_id: string
  org_id: string
  title: string
  description: string | null
  status: ActionItemStatus
  assignee_name: string | null
  assignee_contact_id: string | null
  due_date: string | null
  due_date_raw: string | null
  source_segment_id: string | null
  source_text: string | null
  task_id: string | null
  confidence: number | null
  priority: string
  created_at: string
  updated_at: string
}

export interface MeetingWithRelations extends Meeting {
  participants: MeetingParticipant[]
  action_items: MeetingActionItem[]
  segment_count: number
}

export interface TranscriptionProgress {
  meeting_id: string
  status: MeetingStatus
  segments_processed: number
  total_duration_seconds: number | null
  error?: string
}

export interface ActionExtractionResult {
  actions: Array<{
    title: string
    description: string
    assignee_name: string | null
    due_date_raw: string | null
    source_text: string
    confidence: number
    priority: 'critical' | 'high' | 'medium' | 'low'
  }>
  summary: string
  key_decisions: string[]
  sentiment: {
    score: number
    label: 'positive' | 'neutral' | 'negative' | 'mixed'
  }
}

// Upload constraints
export const MAX_RECORDING_SIZE = 500 * 1024 * 1024 // 500MB
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg',
  'audio/webm', 'audio/flac',
]
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
]
export const ALLOWED_MIME_TYPES = [...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES]
