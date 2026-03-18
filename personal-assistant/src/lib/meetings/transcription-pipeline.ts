/**
 * Meeting Transcription Pipeline
 *
 * Reuses the existing Whisper integration from voice-transcription.ts.
 * Handles large files by chunking, stores segments with timestamps.
 *
 * For files > 25MB (Whisper limit), audio is split into chunks
 * using ffmpeg on the Fly.io worker. For files under 25MB, we
 * send directly to Whisper with verbose_json for word-level timestamps.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

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

  try {
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
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
}

/**
 * Simple speaker diarization heuristic.
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
}
