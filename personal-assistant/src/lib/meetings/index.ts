/**
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
