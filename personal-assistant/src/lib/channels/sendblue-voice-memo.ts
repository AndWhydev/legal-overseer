/**
 * Outbound Voice Memo via Sendblue
 *
 * Synthesizes text → audio via ElevenLabs TTS, converts to Apple CAF format
 * (the only format that renders as a native iMessage voice bubble), uploads
 * to a public URL, and sends via Sendblue's media_url parameter.
 *
 * Flow: text → ElevenLabs TTS → MP3 → ffmpeg → CAF (opus 24k) → upload → send
 *
 * Per Sendblue docs: "the Apple voice note is a .caf file [...] the only
 * format that Apple supports for inline voice notes."
 */

import { uploadMediaToSendblue, sendSendblueMedia } from './sendblue-media'
import { logger } from '@/lib/core/logger'
import type { SendResult } from './sendblue'

/**
 * Synthesize text to MP3 audio via ElevenLabs TTS.
 */
async function synthesizeToMp3(text: string): Promise<Buffer | null> {
  try {
    const { synthesizeSentence } = await import('@/lib/voice/tts-stream')
    const result = await synthesizeSentence(text)
    const chunks: Uint8Array[] = []

    for await (const chunk of result.chunks) {
      chunks.push(chunk)
    }

    if (chunks.length === 0) return null

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const buffer = Buffer.alloc(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    return buffer
  } catch (err) {
    logger.error('[sendblue-voice-memo] TTS synthesis failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Convert MP3 audio to Apple CAF format (opus codec, 24kbps).
 * CAF is the only format iMessage renders as a native voice bubble.
 *
 * Falls back to returning MP3 if ffmpeg is unavailable (will send
 * as a media attachment instead of a voice bubble).
 */
async function convertToCaf(mp3Buffer: Buffer): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  try {
    const { execFile } = await import('child_process')
    const { writeFile, readFile, unlink, mkdtemp } = await import('fs/promises')
    const { join } = await import('path')
    const { tmpdir } = await import('os')

    const dir = await mkdtemp(join(tmpdir(), 'bitbit-caf-'))
    const inputPath = join(dir, 'input.mp3')
    const outputPath = join(dir, 'output.caf')

    await writeFile(inputPath, mp3Buffer)

    // Convert to CAF with opus codec at 24kbps (Sendblue recommended settings)
    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', [
        '-i', inputPath,
        '-c:a', 'libopus',
        '-b:a', '24k',
        '-ar', '24000',
        '-ac', '1',
        '-f', 'caf',
        outputPath,
        '-y',
      ], { timeout: 15_000 }, (err) => err ? reject(err) : resolve())
    })

    const cafBuffer = await readFile(outputPath)
    await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {})

    logger.info('[sendblue-voice-memo] Converted to CAF', {
      inputSize: mp3Buffer.length,
      outputSize: cafBuffer.length,
    })

    return { buffer: cafBuffer, filename: 'voice-memo.caf', mimeType: 'audio/x-caf' }
  } catch (err) {
    logger.warn('[sendblue-voice-memo] CAF conversion failed, will send as MP3 attachment', {
      error: err instanceof Error ? err.message : String(err),
    })
    // Fallback: send as MP3 (won't render as native voice bubble but still playable)
    return { buffer: mp3Buffer, filename: 'voice-memo.mp3', mimeType: 'audio/mpeg' }
  }
}

/**
 * Synthesize text and send as a native iMessage voice memo.
 *
 * Full pipeline:
 * 1. ElevenLabs TTS → MP3
 * 2. ffmpeg → CAF (opus 24k) for native voice bubble rendering
 * 3. Upload to Sendblue CDN
 * 4. Send via Sendblue media_url
 */
export async function sendVoiceMemoBubble(to: string, text: string): Promise<SendResult> {
  // Step 1: Synthesize
  const mp3Buffer = await synthesizeToMp3(text)
  if (!mp3Buffer) {
    return { success: false, error: 'Voice synthesis failed' }
  }

  // Step 2: Convert to CAF
  const { buffer: audioBuffer, filename, mimeType } = await convertToCaf(mp3Buffer)

  // Step 3: Upload
  const mediaUrl = await uploadMediaToSendblue(audioBuffer, filename, mimeType)
  if (!mediaUrl) {
    return { success: false, error: 'Media upload failed' }
  }

  // Step 4: Send (no caption — voice memo speaks for itself)
  const result = await sendSendblueMedia(to, mediaUrl)
  if (result.success) {
    logger.info('[sendblue-voice-memo] Voice memo sent', { to, textLength: text.length, format: mimeType })
  }
  return result
}
