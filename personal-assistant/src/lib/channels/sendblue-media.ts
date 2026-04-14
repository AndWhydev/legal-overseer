import { logger } from '@/lib/core/logger'

export interface SendblueMedia {
  buffer: Buffer
  mimeType: string
  filename: string
  category: 'audio' | 'image' | 'video' | 'document'
}

/**
 * Download media from a Sendblue media URL and categorize it.
 * Returns null if the download fails or URL is invalid.
 */
export async function downloadSendblueMedia(mediaUrl: string | undefined): Promise<SendblueMedia | null> {
  if (!mediaUrl) return null

  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) {
      logger.warn('[sendblue-media] Failed to download media', { mediaUrl, status: response.status })
      return null
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await response.arrayBuffer())

    // Derive filename from URL or content type
    const urlPath = new URL(mediaUrl).pathname
    const filename = urlPath.split('/').pop() || `media.${contentType.split('/')[1] || 'bin'}`

    // Categorize by MIME type
    let category: SendblueMedia['category'] = 'document'
    if (contentType.startsWith('audio/')) category = 'audio'
    else if (contentType.startsWith('image/')) category = 'image'
    else if (contentType.startsWith('video/')) category = 'video'

    return { buffer, mimeType: contentType, filename, category }
  } catch (err) {
    logger.error('[sendblue-media] Error downloading media', { mediaUrl, error: String(err) })
    return null
  }
}
