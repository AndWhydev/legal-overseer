/**
 * Gmail Attachment Fetcher
 *
 * Downloads and processes email attachments via the Gmail API.
 * Extracts text from PDFs, documents, and spreadsheets for:
 * - RAG embedding (searchable via search_memory)
 * - Knowledge extraction (invoice details, contracts, etc.)
 * - Onboarding synthesis (learn from historical documents)
 */

import { logger } from '@/lib/core/logger'
import { processAttachment } from '@/lib/rag/attachment-processor'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GmailAttachmentMeta {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

export interface ExtractedAttachment {
  filename: string
  mimeType: string
  extractedText: string
  sizeBytes: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max attachment size to download (10MB) */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** MIME types worth processing (skip images, zips, etc.) */
const PROCESSABLE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'text/html',
])

// ─── Fetch Attachments ───────────────────────────────────────────────────────

/**
 * Get attachment metadata from a Gmail message.
 * Requires the message to be fetched with format=full.
 */
export function extractAttachmentMeta(
  messageParts: GmailMessagePart[],
): GmailAttachmentMeta[] {
  const attachments: GmailAttachmentMeta[] = []

  function walk(parts: GmailMessagePart[]) {
    for (const part of parts) {
      if (part.body?.attachmentId && part.filename) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType ?? 'application/octet-stream',
          size: part.body.size ?? 0,
        })
      }
      if (part.parts) walk(part.parts)
    }
  }

  walk(messageParts)
  return attachments
}

/**
 * Download and extract text from a Gmail attachment.
 */
export async function fetchAndProcessAttachment(
  accessToken: string,
  messageId: string,
  attachment: GmailAttachmentMeta,
): Promise<ExtractedAttachment | null> {
  // Skip non-processable types
  if (!PROCESSABLE_TYPES.has(attachment.mimeType)) {
    return null
  }

  // Skip oversized attachments
  if (attachment.size > MAX_ATTACHMENT_BYTES) {
    logger.debug('[gmail-attachments] Skipping oversized attachment', {
      filename: attachment.filename,
      size: attachment.size,
    })
    return null
  }

  try {
    // Download attachment data
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachment.attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!res.ok) {
      logger.warn('[gmail-attachments] Download failed', {
        filename: attachment.filename,
        status: res.status,
      })
      return null
    }

    const data = await res.json() as { data?: string; size?: number }
    if (!data.data) return null

    // Gmail returns URL-safe base64. Convert to standard base64 then to Buffer
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
    const buffer = Buffer.from(base64, 'base64')

    // Extract text via attachment processor
    const text = await processAttachment(buffer, attachment.mimeType)

    if (!text || text.trim().length < 10) return null

    logger.info('[gmail-attachments] Extracted text from attachment', {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      textLength: text.length,
    })

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      extractedText: text,
      sizeBytes: buffer.length,
    }
  } catch (err) {
    logger.warn('[gmail-attachments] Processing failed', {
      filename: attachment.filename,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Fetch a full Gmail message (with body and attachment metadata).
 * Returns the message parts for attachment extraction.
 */
export async function fetchFullGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<{
  body: string
  parts: GmailMessagePart[]
  hasAttachments: boolean
} | null> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!res.ok) return null
    const msg = await res.json() as GmailFullMessage

    // Extract plain text body
    let body = ''
    function extractBody(parts: GmailMessagePart[]) {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          const decoded = Buffer.from(
            part.body.data.replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
          ).toString('utf-8')
          body += decoded
        }
        if (part.parts) extractBody(part.parts)
      }
    }

    const parts = msg.payload?.parts ?? [msg.payload]
    extractBody(parts)

    const attachmentMeta = extractAttachmentMeta(parts)

    return {
      body: body.slice(0, 10000), // Cap at 10K chars
      parts,
      hasAttachments: attachmentMeta.length > 0,
    }
  } catch {
    return null
  }
}

/**
 * Process all attachments from a Gmail message.
 * Returns extracted text from each processable attachment.
 */
export async function processMessageAttachments(
  accessToken: string,
  messageId: string,
  parts: GmailMessagePart[],
): Promise<ExtractedAttachment[]> {
  const meta = extractAttachmentMeta(parts)
  const processable = meta.filter(a => PROCESSABLE_TYPES.has(a.mimeType))

  if (processable.length === 0) return []

  const results = await Promise.allSettled(
    processable.map(a => fetchAndProcessAttachment(accessToken, messageId, a))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<ExtractedAttachment | null> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value!)
}

// ─── Gmail API Types ─────────────────────────────────────────────────────────

interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  body?: {
    attachmentId?: string
    size?: number
    data?: string
  }
  parts?: GmailMessagePart[]
}

interface GmailFullMessage {
  id: string
  payload: GmailMessagePart & { parts?: GmailMessagePart[] }
}
