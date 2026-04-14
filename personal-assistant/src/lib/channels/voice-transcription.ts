import { logger } from '@/lib/core/logger';
import { getOpenAIEndpoint } from '@/lib/ai/openai-gateway';
/**
 * Voice Note Transcription Pipeline
 *
 * Provides OpenAI Whisper-based transcription for voice messages from
 * WhatsApp, Telegram, and other voice-supporting channels.
 *
 * Features:
 * - Supports audio formats: opus, ogg, mp3, m4a, wav, webm
 * - Handles URL downloads and buffer transcription
 * - Graceful error handling with fallback messages
 * - Never throws — returns safe fallback results on failure
 * - Optional language hint for better accuracy
 *
 * Latency: ~2-3 seconds per transcription (acceptable in 10s SLA)
 */

export interface TranscriptionResult {
  /**
   * The transcribed text, or empty string on failure.
   */
  text: string
  /**
   * Duration of the audio in seconds (from Whisper verbose response).
   * Will be null if unavailable or transcription failed.
   */
  duration: number | null
  /**
   * Detected language code (e.g., 'en', 'es', 'fr').
   * Will be null if unavailable or transcription failed.
   */
  language: string | null
  /**
   * Whether transcription succeeded. If false, text will be empty
   * and the caller should treat the audio as non-transcribable.
   */
  success: boolean
  /**
   * Optional error message for logging/debugging.
   */
  error?: string
}

const WHISPER_MODEL = 'whisper-1'
const TIMEOUT_MS = 30_000
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB (Whisper API limit)

/**
 * Infer file extension from MIME type.
 */
function getFileExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  return 'ogg' // Default for WhatsApp audio
}

/**
 * Transcribe an audio buffer using OpenAI Whisper API.
 *
 * @param audioBuffer - Raw audio data
 * @param mimeType - MIME type of the audio (e.g., 'audio/ogg;codecs=opus')
 * @param options - Optional language hint and prompt
 * @returns TranscriptionResult with text, duration, language, and success flag
 *
 * Never throws. On API error, network failure, or timeout, returns
 * a failed result with empty text.
 */
export async function transcribeVoiceNote(
  audioBuffer: Buffer | Uint8Array,
  mimeType: string,
  options?: {
    language?: string
    prompt?: string
  }
): Promise<TranscriptionResult> {
  const endpoint = getOpenAIEndpoint()

  if (!endpoint) {
    const error = 'Neither AI_GATEWAY_API_KEY nor OPENAI_API_KEY configured'
    logger.warn('[voice-transcription]', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }

  // Validate buffer size
  const bufferSize = audioBuffer.length
  if (bufferSize === 0) {
    const error = 'Empty audio buffer'
    logger.warn('[voice-transcription]', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }

  if (bufferSize > MAX_AUDIO_SIZE_BYTES) {
    const error = `Audio exceeds 25 MB limit: ${bufferSize} bytes`
    logger.warn('[voice-transcription]', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }

  try {
    const ext = getFileExtensionFromMimeType(mimeType)
    const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer)

    // Use Blob API (available in Node 18+) to create FormData
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    const formData = new FormData()
    formData.append('file', blob, `voice.${ext}`)
    formData.append('model', WHISPER_MODEL)

    // Add optional language hint
    if (options?.language) {
      formData.append('language', options.language)
    }

    // Add optional prompt for context
    if (options?.prompt) {
      formData.append('prompt', options.prompt)
    }

    // Request verbose output to get duration and language
    formData.append('response_format', 'verbose_json')

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response | undefined
    try {
      response = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: endpoint.authorization,
        },
        body: formData,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (!response.ok) {
      const errorText = await response.text()
      const error = `Whisper API error: ${response.status} ${errorText}`
      logger.error('[voice-transcription]', error)
      return {
        text: '',
        duration: null,
        language: null,
        success: false,
        error,
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any
    const transcribedText = data.text?.trim() ?? ''

    if (!transcribedText) {
      const error = 'Whisper returned empty transcription'
      logger.warn('[voice-transcription]', error)
      return {
        text: '',
        duration: null,
        language: null,
        success: false,
        error,
      }
    }

    return {
      text: transcribedText,
      duration: typeof data.duration === 'number' ? data.duration : null,
      language: typeof data.language === 'string' ? data.language : null,
      success: true,
    }
  } catch (err) {
    let error = 'Unknown error'
    if (err instanceof Error) {
      error = err.message
      if (err.name === 'AbortError') {
        error = 'Transcription timeout (30s)'
      }
    }
    logger.error('[voice-transcription] Transcription failed:', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }
}

/**
 * Download audio from a URL and transcribe it.
 *
 * Used for WhatsApp Cloud API media URLs or other external sources
 * that require authentication headers.
 *
 * @param mediaUrl - URL of the audio file
 * @param authToken - Optional authorization token for the download
 * @param options - Optional language hint and prompt
 * @returns TranscriptionResult
 *
 * Never throws. Returns failed result on download or transcription error.
 */
export async function transcribeFromUrl(
  mediaUrl: string,
  authToken?: string,
  options?: {
    language?: string
    prompt?: string
  }
): Promise<TranscriptionResult> {
  if (!mediaUrl) {
    const error = 'Empty media URL'
    logger.warn('[voice-transcription]', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }

  try {
    const headers: Record<string, string> = {}
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`
    }

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response | undefined
    try {
      response = await fetch(mediaUrl, {
        headers,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (!response.ok) {
      const error = `Failed to download audio: HTTP ${response.status}`
      logger.error('[voice-transcription]', error)
      return {
        text: '',
        duration: null,
        language: null,
        success: false,
        error,
      }
    }

    const contentType = response.headers.get('content-type') ?? 'audio/ogg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return transcribeVoiceNote(buffer, contentType, options)
  } catch (err) {
    let error = 'Unknown error during download'
    if (err instanceof Error) {
      error = err.message
      if (err.name === 'AbortError') {
        error = 'Download timeout (30s)'
      }
    }
    logger.error('[voice-transcription] Download failed:', error)
    return {
      text: '',
      duration: null,
      language: null,
      success: false,
      error,
    }
  }
}

/**
 * Create a user-friendly message for a failed transcription.
 * Used by channels to provide feedback when transcription fails.
 */
export function getFallbackMessage(includeReason: boolean = false): string {
  return includeReason
    ? '[Voice note - transcription unavailable]'
    : '[Voice note]'
}
