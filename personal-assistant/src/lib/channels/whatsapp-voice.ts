/**
 * WhatsApp voice note transcription service.
 *
 * Handles downloading audio from Meta Cloud API and transcribing
 * via OpenAI Whisper. Used by both the webhook route (Cloud API path)
 * and the Baileys bridge (which downloads media via Baileys directly).
 *
 * Latency note: Whisper transcription adds ~2-3s. This is acceptable
 * within the 10s SLA (WHATS-04) since the rest of the pipeline is <2s.
 */

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const GRAPH_API_VERSION = 'v21.0'

/**
 * Transcribe an audio buffer using OpenAI Whisper API.
 *
 * Reuses the same Whisper pattern as `/api/ai/voice/route.ts`:
 * create FormData, POST to OpenAI, return text.
 *
 * @param audioBuffer - Raw audio data (typically audio/ogg;codecs=opus from WhatsApp)
 * @param mimeType - MIME type of the audio (e.g. 'audio/ogg', 'audio/ogg;codecs=opus')
 * @returns Transcribed text, or null on failure
 */
export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    logger.warn('[whatsapp-voice] OPENAI_API_KEY not set — voice transcription unavailable')
    return null
  }

  try {
    // Determine file extension from MIME type
    const ext = mimeType.startsWith('audio/ogg') ? 'ogg'
      : mimeType.includes('mp4') ? 'mp4'
      : mimeType.includes('mpeg') ? 'mp3'
      : mimeType.includes('webm') ? 'webm'
      : 'ogg' // Default to ogg for WhatsApp audio

    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })
    const formData = new FormData()
    formData.append('file', blob, `voice.${ext}`)
    formData.append('model', 'whisper-1')

    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errBody = await response.text()
      logger.error('[whatsapp-voice] Whisper API error:', response.status, errBody)
      return null
    }

    const data = await response.json() as { text: string }
    const text = data.text?.trim()

    if (!text) {
      logger.warn('[whatsapp-voice] Whisper returned empty transcription')
      return null
    }

    return text
  } catch (err) {
    logger.error('[whatsapp-voice] Transcription failed:', err)
    return null
  }
}

/**
 * Download media from the Meta Cloud API (Graph API).
 *
 * For the Cloud API webhook path — first fetches the media URL,
 * then downloads the binary content.
 *
 * Note: The Baileys bridge uses Baileys' own `downloadMediaMessage` instead.
 *
 * @param mediaId - Media ID from the webhook payload (e.g. msg.audio.id)
 * @param accessToken - WhatsApp Business API access token
 * @returns Audio buffer, or null on failure
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<Buffer | null> {
  try {
    // Step 1: Get the media URL from Graph API
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!metaRes.ok) {
      logger.error('[whatsapp-voice] Failed to get media URL:', metaRes.status)
      return null
    }

    const metaData = await metaRes.json() as { url?: string }
    if (!metaData.url) {
      logger.error('[whatsapp-voice] No URL in media response')
      return null
    }

    // Step 2: Download the actual media binary
    const mediaRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!mediaRes.ok) {
      logger.error('[whatsapp-voice] Failed to download media:', mediaRes.status)
      return null
    }

    const arrayBuffer = await mediaRes.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    logger.error('[whatsapp-voice] Media download failed:', err)
    return null
  }
}
