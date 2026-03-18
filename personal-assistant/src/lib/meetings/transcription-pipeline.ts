/**
 * Meeting Transcription Pipeline
 *
<<<<<<< HEAD
 * Reuses the existing Whisper integration from voice-transcription.ts.
 * Handles large files by chunking, stores segments with timestamps.
 *
 * For files > 25MB (Whisper limit), audio is split into chunks
 * using ffmpeg on the Fly.io worker. For files under 25MB, we
 * send directly to Whisper with verbose_json for word-level timestamps.
=======
 * Orchestrates the end-to-end transcription of meeting recordings:
 * 1. Download/read audio from Supabase Storage
 * 2. Chunk long audio into segments (Whisper has 25MB limit)
 * 3. Transcribe each chunk via OpenAI Whisper
 * 4. Parse timestamps and speaker segments
 * 5. Store transcript segments in database
 *
 * Reuses the existing Whisper integration from voice-transcription.ts.
 * Designed to run on Fly.io workers (long-running, not Vercel).
>>>>>>> v1.5-marketing-launch
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
<<<<<<< HEAD

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const WHISPER_MODEL = 'whisper-1'
const TIMEOUT_MS = 120_000 // 2 minutes for large files
const MAX_WHISPER_SIZE = 25 * 1024 * 1024 // 25MB

interface WhisperWord {
  word: string
  start: number
  end: number
}

interface WhisperSegment {
  id: number
  seek: number
  start: number
  end: number
  text: string
  tokens: number[]
  temperature: number
  avg_logprob: number
  compression_ratio: number
  no_speech_prob: number
}

interface WhisperVerboseResponse {
  task: string
  language: string
  duration: number
  text: string
  words?: WhisperWord[]
  segments?: WhisperSegment[]
}

export interface TranscriptionSegment {
  segment_index: number
  text: string
  start_seconds: number
  end_seconds: number
  speaker_label: string | null
  confidence: number | null
  language: string | null
}

/**
 * Transcribe a meeting recording and store segments.
 * Returns the segments for further processing.
 */
export async function transcribeMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  recordingPath: string,
): Promise<TranscriptionSegment[]> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  // Update meeting status to transcribing
  await supabase
    .from('meetings')
    .update({ status: 'transcribing' })
    .eq('id', meetingId)

  try {
    // Download recording from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('meetings')
      .download(recordingPath)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download recording: ${downloadError?.message ?? 'no data'}`)
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const mimeType = fileData.type || 'audio/mpeg'

    logger.info(`[meeting-transcribe] Starting transcription for meeting ${meetingId}, size=${buffer.length}`)

    let segments: TranscriptionSegment[]

    if (buffer.length <= MAX_WHISPER_SIZE) {
      // Direct transcription for small files
      segments = await transcribeDirectly(buffer, mimeType, openaiKey)
    } else {
      // For large files, transcribe with chunking
      // Each chunk is transcribed separately, then merged
      segments = await transcribeInChunks(buffer, mimeType, openaiKey)
    }

    // Apply simple speaker diarization heuristic
    segments = applySpeakerDiarization(segments)

    // Store segments in database
    if (segments.length > 0) {
      const segmentRows = segments.map(seg => ({
        meeting_id: meetingId,
        org_id: orgId,
        segment_index: seg.segment_index,
        text: seg.text,
        speaker_label: seg.speaker_label,
        start_seconds: seg.start_seconds,
        end_seconds: seg.end_seconds,
        confidence: seg.confidence,
        language: seg.language,
      }))

      // Insert in batches of 100
      for (let i = 0; i < segmentRows.length; i += 100) {
        const batch = segmentRows.slice(i, i + 100)
        const { error } = await supabase
          .from('transcript_segments')
          .insert(batch)
        if (error) {
          logger.error(`[meeting-transcribe] Failed to insert segment batch ${i}:`, error.message)
        }
      }
    }

    // Update meeting with total duration
    const totalDuration = segments.length > 0
      ? Math.ceil(segments[segments.length - 1].end_seconds)
      : 0

    await supabase
      .from('meetings')
      .update({
        status: 'transcribed',
        duration_seconds: totalDuration,
      })
      .eq('id', meetingId)

    logger.info(`[meeting-transcribe] Transcription complete: ${segments.length} segments, ${totalDuration}s duration`)
    return segments
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error(`[meeting-transcribe] Transcription failed for meeting ${meetingId}:`, errorMsg)

    await supabase
      .from('meetings')
      .update({
        status: 'failed',
        error_message: errorMsg,
      })
      .eq('id', meetingId)

    throw err
  }
}

/**
 * Transcribe a file directly with Whisper verbose_json format.
 */
async function transcribeDirectly(
  buffer: Buffer,
  mimeType: string,
  openaiKey: string,
): Promise<TranscriptionSegment[]> {
  const ext = getExtension(mimeType)
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })

  const formData = new FormData()
  formData.append('file', blob, `recording.${ext}`)
  formData.append('model', WHISPER_MODEL)
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')
  formData.append('timestamp_granularities[]', 'word')

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS)
=======
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
>>>>>>> v1.5-marketing-launch

  try {
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
<<<<<<< HEAD
      const errBody = await response.text()
      throw new Error(`Whisper API error ${response.status}: ${errBody}`)
    }

    const data = await response.json() as WhisperVerboseResponse

    if (!data.segments || data.segments.length === 0) {
      // Fall back to full text as single segment
      if (data.text?.trim()) {
        return [{
          segment_index: 0,
          text: data.text.trim(),
          start_seconds: 0,
          end_seconds: data.duration ?? 0,
          speaker_label: null,
          confidence: null,
          language: data.language ?? null,
        }]
      }
      return []
    }

    return data.segments.map((seg, i) => ({
      segment_index: i,
      text: seg.text.trim(),
      start_seconds: seg.start,
      end_seconds: seg.end,
      speaker_label: null,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : null,
      language: data.language ?? null,
    }))
  } finally {
    clearTimeout(timeoutHandle)
  }
}

/**
 * Transcribe a large file in chunks.
 * Splits the buffer into ~24MB pieces (under Whisper's 25MB limit).
 */
async function transcribeInChunks(
  buffer: Buffer,
  mimeType: string,
  openaiKey: string,
): Promise<TranscriptionSegment[]> {
  const chunkSize = 24 * 1024 * 1024 // 24MB chunks
  const chunks: Buffer[] = []

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)))
  }

  logger.info(`[meeting-transcribe] Transcribing in ${chunks.length} chunks`)

  const allSegments: TranscriptionSegment[] = []
  let segmentOffset = 0
  let timeOffset = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    logger.info(`[meeting-transcribe] Processing chunk ${i + 1}/${chunks.length}`)

    const chunkSegments = await transcribeDirectly(chunk, mimeType, openaiKey)

    // Offset segment indices and timestamps for subsequent chunks
    for (const seg of chunkSegments) {
      allSegments.push({
        ...seg,
        segment_index: segmentOffset + seg.segment_index,
        start_seconds: timeOffset + seg.start_seconds,
        end_seconds: timeOffset + seg.end_seconds,
      })
    }

    segmentOffset += chunkSegments.length
    if (chunkSegments.length > 0) {
      timeOffset = chunkSegments[chunkSegments.length - 1].end_seconds + timeOffset
    }
  }

  return allSegments
=======
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
>>>>>>> v1.5-marketing-launch
}

/**
 * Simple speaker diarization heuristic.
<<<<<<< HEAD
 *
 * Uses pause detection between segments to infer speaker changes.
 * When there's a significant pause (>1.5s) between segments, we assume
 * a speaker change. This is a simple heuristic — real diarization
 * would use pyannote or similar.
 */
function applySpeakerDiarization(segments: TranscriptionSegment[]): TranscriptionSegment[] {
  if (segments.length === 0) return segments

  const PAUSE_THRESHOLD = 1.5 // seconds
  let currentSpeaker = 1
  let speakerChangeCount = 0

  return segments.map((seg, i) => {
    if (i > 0) {
      const prevEnd = segments[i - 1].end_seconds
      const gap = seg.start_seconds - prevEnd

      if (gap >= PAUSE_THRESHOLD) {
        // Toggle between speakers on pause
        currentSpeaker = currentSpeaker === 1 ? 2 : 1
        speakerChangeCount++
      }
    }

    return {
      ...seg,
      speaker_label: `Speaker ${currentSpeaker}`,
    }
  })
}

function getExtension(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'wav'
  if (mimeType.includes('m4a') || mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('quicktime')) return 'mov'
  return 'mp3'
=======
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
>>>>>>> v1.5-marketing-launch
}
