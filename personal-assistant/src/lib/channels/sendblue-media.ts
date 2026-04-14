/**
 * Sendblue Media Utilities
 *
 * Download inbound media, upload outbound media, and send media messages.
 */

import { logger } from '@/lib/core/logger'
import { sendSendblueMessage, type SendResult } from './sendblue'

const SENDBLUE_API_BASE = 'https://api.sendblue.co/api'
const DOWNLOAD_TIMEOUT_MS = 30_000
const MAX_MEDIA_SIZE = 100 * 1024 * 1024

export type MediaCategory = 'audio' | 'image' | 'video' | 'document' | 'unknown'

export interface DownloadedMedia {
  buffer: Buffer
  mimeType: string
  filename: string
  category: MediaCategory
}

// Back-compat alias
export type SendblueMedia = DownloadedMedia

function inferMimeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase()
  const map: Record<string, string> = {
    caf: 'audio/x-caf', m4a: 'audio/mp4', mp3: 'audio/mpeg',
    ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', heic: 'image/heic', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime',
    pdf: 'application/pdf', vcf: 'text/vcard',
  }
  return map[ext || ''] || 'application/octet-stream'
}

export function categorizeMedia(mimeType: string): MediaCategory {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.startsWith('text/')) return 'document'
  return 'unknown'
}

export function isVoiceMemoMime(mimeType: string): boolean {
  return mimeType.startsWith('audio/')
}

export async function downloadSendblueMedia(mediaUrl: string | undefined): Promise<DownloadedMedia | null> {
  if (!mediaUrl) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    const res = await fetch(mediaUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      logger.error('[sendblue-media] Download failed', { status: res.status, url: mediaUrl.slice(0, 100) })
      return null
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.length > MAX_MEDIA_SIZE) {
      logger.warn('[sendblue-media] Media exceeds 100 MB', { size: buffer.length })
      return null
    }

    const contentType = res.headers.get('content-type') || inferMimeFromUrl(mediaUrl)
    const mimeType = contentType.split(';')[0].trim()
    const category = categorizeMedia(mimeType)

    const disposition = res.headers.get('content-disposition')
    let filename = 'media'
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      if (match) filename = match[1]
    } else {
      const urlPath = new URL(mediaUrl).pathname
      filename = urlPath.split('/').pop() || 'media'
    }

    return { buffer, mimeType, filename, category }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) {
      logger.error('[sendblue-media] Download timeout (30s)', { url: mediaUrl.slice(0, 100) })
    } else {
      logger.error('[sendblue-media] Download error', { err, url: mediaUrl.slice(0, 100) })
    }
    return null
  }
}

export async function uploadMediaToSendblue(buffer: Buffer, filename: string, mimeType: string): Promise<string | null> {
  const apiKey = process.env.SENDBLUE_API_KEY
  const apiSecret = process.env.SENDBLUE_API_SECRET
  if (!apiKey || !apiSecret) return null

  try {
    const blob = new Blob([buffer], { type: mimeType })
    const formData = new FormData()
    formData.append('media', blob, filename)

    const res = await fetch(`${SENDBLUE_API_BASE}/upload-media-object`, {
      method: 'POST',
      headers: { 'sb-api-key-id': apiKey, 'sb-api-secret-key': apiSecret },
      body: formData,
    })

    const data = await res.json() as { media_url?: string; error_message?: string }
    if (data.error_message) {
      logger.error('[sendblue-media] Upload error', { error: data.error_message })
      return null
    }
    return data.media_url || null
  } catch (err) {
    logger.error('[sendblue-media] Upload failed', { err })
    return null
  }
}

export async function sendSendblueMedia(to: string, mediaUrl: string, caption?: string): Promise<SendResult> {
  return sendSendblueMessage(to, caption || '', { mediaUrl })
}
