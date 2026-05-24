/**
 * Dictation module — public surface.
 *
 * Audio upload + Whisper transcription + lawyer-review-before-submit
 * flow. The skill task is queued via the standard tasks table so the
 * task processor picks it up like any other piece of work.
 */

export { handleDictationRoute, isDictationRoute } from './server.js';
export { transcribeAudio, isTranscriptionAvailable, type TranscriptionResult } from './transcribe.js';
