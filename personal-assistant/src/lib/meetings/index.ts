/**
<<<<<<< HEAD
 * Meeting Intelligence — Public API
 */

export type {
  Meeting,
  MeetingWithRelations,
  MeetingParticipant,
  TranscriptSegment,
  MeetingActionItem,
  MeetingStatus,
  MeetingSource,
  ActionItemStatus,
  ActionExtractionResult,
  TranscriptionProgress,
} from './types'

export {
  MAX_RECORDING_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
} from './types'

export {
  createMeeting,
  uploadRecording,
  getMeeting,
  listMeetings,
  getTranscriptSegments,
  updateMeeting,
  updateActionItem,
  updateSpeakerName,
  deleteMeeting,
  searchTranscripts,
  createTasksFromActionItems,
} from './meeting-service'

export { transcribeMeeting } from './transcription-pipeline'
export { extractMeetingIntelligence } from './action-extractor'
export { draftFollowUpEmail, queueFollowUpEmail } from './followup-drafter'
export { meetingToolDefinitions, meetingToolHandlers } from './agent-tools'
=======
 * Meeting Intelligence Module
 *
 * Provides end-to-end meeting processing:
 * - Recording upload and storage
 * - Whisper-based transcription with timestamps
 * - AI extraction of action items, decisions, and sentiment
 * - Kanban task creation from action items
 * - Follow-up email drafting
 * - Full-text search across transcripts
 */

export * from './types'
export * from './meeting-service'
export * from './transcription-pipeline'
export * from './ai-extraction'
export * from './follow-up-sender'
>>>>>>> v1.5-marketing-launch
