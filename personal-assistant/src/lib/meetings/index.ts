/**
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
