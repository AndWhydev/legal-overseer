/**
 * Meeting Transcription Pipeline
 *
 * Orchestrates the end-to-end transcription of meeting recordings:
 * 1. Download/read audio from Supabase Storage
 * 2. Chunk long audio into segments (Whisper has 25MB limit)
 * 3. Transcribe each chunk via OpenAI Whisper
 * 4. Parse timestamps and speaker segments
 * 5. Store transcript segments in database
 *
 * Reuses the existing Whisper integration from voice-transcription.ts.
 * Designed to run on Fly.io workers (long-running, not Vercel).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { updateMeetingStatus, insertTranscriptSegments } from './meeting-service'
import type { Meeting, TranscriptSegment } from './types'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const WHISPER_MODEL = 'whisper-1'
const MAX_CHUNK_BYTES = 24 * 1024 * 1024 // 24 MB to stay under 25 MB limit
const TRANSCRIPTION_TIMEOUT_MS = 120_000 // 2 minutes per chunk

/** Supported audio/video MIME types */
const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
  'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-wav',
  'audio/flac', 'audio/aac',
  'video/mp4', 'video/webm', 'video/quicktime',
])

interface TranscriptionOptions {
  language?: string
  prompt?: string
}

interface WhisperVerboseResponse {
  text: string
  language: string
  duration: number
  segments?: Array<{
    id: number
    start: number
    end: number
    text: string
    avg_logprob?: number
  }>
}

/**
 * Run the full transcription pipeline for a meeting.
 *
 * Updates meeting status through the lifecycle:
 * pending -> transcribing -> processing (for AI extraction later) -> completed/failed
 */
export async function runTranscriptionPipeline(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  options?: TranscriptionOptions
): Promise<{
  success: boolean
  segmentCount: number
  durationSeconds: number
  fullText: string
  error?: string
}> {
  logger.info('[transcription-pipeline] Starting for meeting:', meetingId)

  // 1. Get meeting record
  const { data: meeting, error: meetingErr } = await supabase
    .from('meetings')
    .select('id, recording_path, recording_mime_type, recording_size_bytes')
    .eq('id', meetingId)
    .single()

  if (meetingErr || !meeting) {
    const error = `Meeting not found: ${meetingErr?.message}`
    logger.error('[transcription-pipeline]', error)
    return { success: false, segmentCount: 0, durationSeconds: 0, fullText: '', error }
  }

  if (!meeting.recording_path) {
    const error = 'No recording file attached to meeting'
    logger.error('[transcription-pipeline]', error)
    await updateMeetingStatus(supabase, meetingId, 'failed', {
      metadata: { error },
    } as Partial<Meeting>)
    return { success: false, segmentCount: 0, durationSeconds: 0, fullText: '', error }
  }

  // 2. Update status to transcribing
  await updateMeetingStatus(supabase, meetingId, 'transcribing')

  // 3. Download audio from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('recordings')
    .download(meeting.recording_path)

  if (downloadErr || !fileData) {
    const error = `Failed to download recording: ${downloadErr?.message}`
    logger.error('[transcription-pipeline]', error)
    await updateMeetingStatus(supabase, meetingId, 'failed', {
      metadata: { error },
    } as Partial<Meeting>)
    return { success: false, segmentCount: 0, durationSeconds: 0, fullText: '', error }
  }

  const audioBuffer = Buffer.from(await fileData.arrayBuffer())
  const mimeType = meeting.recording_mime_type || 'audio/mp3'

  logger.info('[transcription-pipeline] Audio downloaded:', {
    size: audioBuffer.length,
    mimeType,
  })

  // 4. Transcribe
  try {
    const result = await transcribeAudio(audioBuffer, mimeType, options)

    if (!result.success) {
      await updateMeetingStatus(supabase, meetingId, 'failed', {
        metadata: { error: result.error },
      } as Partial<Meeting>)
      return {
        success: false,
        segmentCount: 0,
        durationSeconds: 0,
        fullText: '',
        error: result.error,
      }
    }

    // 5. Store transcript segments
    const segmentRows = result.segments.map((seg, idx) => ({
      segment_index: idx,
      speaker_label: seg.speaker_label || undefined,
      start_time_ms: Math.round(seg.start * 1000),
      end_time_ms: Math.round(seg.end * 1000),
      text: seg.text.trim(),
      confidence: seg.confidence ?? undefined,
      language: result.language || 'en',
    }))

    const insertOk = await insertTranscriptSegments(
      supabase,
      meetingId,
      orgId,
      segmentRows
    )

    if (!insertOk) {
      await updateMeetingStatus(supabase, meetingId, 'failed', {
        metadata: { error: 'Failed to store transcript segments' },
      } as Partial<Meeting>)
      return {
        success: false,
        segmentCount: 0,
        durationSeconds: 0,
        fullText: '',
        error: 'Failed to store transcript segments',
      }
    }

    // 6. Update meeting status to processing (AI extraction next)
    await updateMeetingStatus(supabase, meetingId, 'processing', {
      duration_seconds: Math.round(result.duration),
    } as Partial<Meeting>)

    const fullText = result.segments.map(s => s.text.trim()).join(' ')

    logger.info('[transcription-pipeline] Transcription complete:', {
      meetingId,
      segments: segmentRows.length,
      duration: result.duration,
    })

    return {
      success: true,
      segmentCount: segmentRows.length,
      durationSeconds: Math.round(result.duration),
      fullText,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown transcription error'
    logger.error('[transcription-pipeline] Transcription failed:', error)
    await updateMeetingStatus(supabase, meetingId, 'failed', {
      metadata: { error },
    } as Partial<Meeting>)
    return { success: false, segmentCount: 0, durationSeconds: 0, fullText: '', error }
  }
}

// ── Core Whisper Transcription ──────────────────────────────────────────────

interface TranscriptionSegment {
  start: number // seconds
  end: number   // seconds
  text: string
  speaker_label?: string
  confidence?: number
}

interface TranscriptionResult {
  success: boolean
  segments: TranscriptionSegment[]
  duration: number // total seconds
  language: string
  error?: string
}

/**
 * Transcribe audio using OpenAI Whisper API with verbose JSON output.
 * Returns timestamped segments for storage.
 */
async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return {
      success: false,
      segments: [],
      duration: 0,
      language: 'en',
      error: 'OPENAI_API_KEY not configured',
    }
  }

  // If file is too large, we need to chunk it
  // For now, we'll attempt the whole file — Whisper handles up to 25MB
  if (audioBuffer.length > MAX_CHUNK_BYTES) {
    logger.warn('[transcription-pipeline] Audio exceeds 24MB, attempting anyway')
  }

  const ext = getExtensionFromMime(mimeType)
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })

  const formData = new FormData()
  formData.append('file', blob, `meeting.${ext}`)
  formData.append('model', WHISPER_MODEL)
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')

  if (options?.language) {
    formData.append('language', options.language)
  }
  if (options?.prompt) {
    formData.append('prompt', options.prompt)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS)

  try {
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      return {
        success: false,
        segments: [],
        duration: 0,
        language: 'en',
        error: `Whisper API error: ${response.status} ${errText}`,
      }
    }

    const data = (await response.json()) as WhisperVerboseResponse

    // Convert Whisper segments to our format
    const segments: TranscriptionSegment[] = (data.segments || []).map(seg => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
    }))

    // If no segments returned, create a single segment from the full text
    if (segments.length === 0 && data.text) {
      segments.push({
        start: 0,
        end: data.duration || 0,
        text: data.text,
      })
    }

    return {
      success: true,
      segments,
      duration: data.duration || 0,
      language: data.language || 'en',
    }
  } catch (err) {
    const error = err instanceof Error
      ? (err.name === 'AbortError' ? 'Transcription timeout (2 min)' : err.message)
      : 'Unknown error'
    return {
      success: false,
      segments: [],
      duration: 0,
      language: 'en',
      error,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Simple speaker diarization heuristic.
 * Assigns speaker labels based on silence gaps between segments.
 * For proper diarization, we'd use pyannote or a dedicated service.
 */
export function assignSpeakerLabels(
  segments: TranscriptionSegment[],
  participantNames?: string[]
): TranscriptionSegment[] {
  if (segments.length === 0) return segments

  // Simple heuristic: track speaker changes based on gaps > 1 second
  const SPEAKER_CHANGE_GAP_MS = 1000
  let currentSpeaker = 0
  const maxSpeakers = participantNames?.length || 4

  return segments.map((seg, i) => {
    if (i > 0) {
      const gap = (seg.start - segments[i - 1].end) * 1000
      if (gap > SPEAKER_CHANGE_GAP_MS) {
        currentSpeaker = (currentSpeaker + 1) % maxSpeakers
      }
    }

    const speakerLabel = participantNames
      ? participantNames[currentSpeaker] || `Speaker ${currentSpeaker + 1}`
      : `Speaker ${currentSpeaker + 1}`

    return { ...seg, speaker_label: speakerLabel }
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('aac')) return 'aac'
  if (mimeType.includes('quicktime')) return 'mov'
  return 'mp3' // default
}

/**
 * Check if a MIME type is supported for transcription.
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType) ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/')
}
