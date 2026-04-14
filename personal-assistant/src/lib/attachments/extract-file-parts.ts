/**
 * Extract File Parts from AI SDK Messages
 *
 * Parses AI SDK v6 `file` parts from a user message's parts array,
 * uploads data-URL files to Supabase Storage, creates attachment
 * records, and returns the resulting attachment IDs.
 *
 * Supports two file part formats:
 * - Data URLs (base64-encoded): decoded, uploaded, and tracked
 * - HTTP(S) URLs: stored as-is with a reference attachment record
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateFile, STORAGE_BUCKET, ALLOWED_MIME_TYPES } from './constants'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of an AI SDK v6 file part as it arrives in the request body. */
export interface FilePart {
  type: 'file'
  mediaType: string
  url: string
  filename?: string
}

interface ExtractResult {
  attachmentIds: string[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DATA_URL_SIZE = 10 * 1024 * 1024 // 10 MB decoded
const MAX_FILES_PER_MESSAGE = 5
const DATA_URL_PREFIX = 'data:'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a string is a data URL. */
function isDataUrl(url: string): boolean {
  return url.startsWith(DATA_URL_PREFIX)
}

/** Parse a data URL into its MIME type and binary buffer. */
function parseDataUrl(url: string): { mimeType: string; buffer: Buffer } | null {
  // Format: data:[<mediatype>][;base64],<data>
  const match = url.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
  if (!match) return null

  const mimeType = match[1]
  const base64Data = match[2]

  try {
    const buffer = Buffer.from(base64Data, 'base64')
    return { mimeType, buffer }
  } catch {
    return null
  }
}

/** Derive a reasonable filename from a MIME type when none is provided. */
function deriveFilename(mimeType: string, index: number): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'text/csv': 'csv',
  }
  const ext = extMap[mimeType] || 'bin'
  return `upload-${index + 1}.${ext}`
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract file parts from an AI SDK v6 message parts array, upload them
 * to Supabase Storage, create attachment records, and return IDs.
 *
 * This function is fault-tolerant per file: individual failures are logged
 * and skipped so the message can still be sent with partial attachments.
 */
export async function extractFilePartAttachments(
  parts: Array<{ type: string; [key: string]: unknown }>,
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId?: string,
): Promise<ExtractResult> {
  const fileParts = parts.filter(
    (p): p is FilePart => p.type === 'file' && typeof p.url === 'string' && typeof p.mediaType === 'string'
  )

  if (fileParts.length === 0) {
    return { attachmentIds: [], errors: [] }
  }

  // Cap file count to prevent unbounded uploads from a single message
  const cappedParts = fileParts.slice(0, MAX_FILES_PER_MESSAGE)
  if (fileParts.length > MAX_FILES_PER_MESSAGE) {
    logger.warn('[extract-file-parts] File count exceeds limit, truncating', {
      received: fileParts.length,
      limit: MAX_FILES_PER_MESSAGE,
    })
  }

  const attachmentIds: string[] = []
  const errors: string[] = []

  for (let i = 0; i < cappedParts.length; i++) {
    const part = cappedParts[i]

    try {
      const id = await processFilePart(part, i, supabase, orgId, userId, threadId)
      if (id) {
        attachmentIds.push(id)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push(`File ${i + 1}: ${errMsg}`)
      logger.warn('[extract-file-parts] Failed to process file part, skipping', {
        index: i,
        mediaType: part.mediaType,
        filename: part.filename,
        error: errMsg,
      })
    }
  }

  if (attachmentIds.length > 0) {
    logger.info('[extract-file-parts] Extracted file attachments', {
      total: fileParts.length,
      succeeded: attachmentIds.length,
      failed: errors.length,
    })
  }

  return { attachmentIds, errors }
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------

async function processFilePart(
  part: FilePart,
  index: number,
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId?: string,
): Promise<string | null> {
  const filename = part.filename || deriveFilename(part.mediaType, index)

  if (isDataUrl(part.url)) {
    return processDataUrlFile(part, filename, supabase, orgId, userId, threadId)
  }

  // HTTP(S) URL — create a reference attachment record
  if (part.url.startsWith('http://') || part.url.startsWith('https://')) {
    return processUrlFile(part, filename, supabase, orgId, userId, threadId)
  }

  logger.warn('[extract-file-parts] Unsupported URL scheme, skipping', {
    filename,
    urlPrefix: part.url.slice(0, 30),
  })
  return null
}

/**
 * Process a data-URL file part: decode, validate, upload to Supabase
 * Storage, and create an attachment record.
 */
async function processDataUrlFile(
  part: FilePart,
  filename: string,
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId?: string,
): Promise<string | null> {
  const parsed = parseDataUrl(part.url)
  if (!parsed) {
    logger.warn('[extract-file-parts] Failed to parse data URL', { filename })
    return null
  }

  const { buffer } = parsed
  // Use the part's declared mediaType (more reliable than data URL header)
  const mimeType = part.mediaType

  // Validate using the shared validation logic
  const validation = validateFile(filename, mimeType, buffer.length)
  if (!validation.valid) {
    logger.warn('[extract-file-parts] File validation failed', {
      filename,
      mimeType,
      size: buffer.length,
      error: validation.error,
    })
    return null
  }

  if (buffer.length > MAX_DATA_URL_SIZE) {
    logger.warn('[extract-file-parts] Data URL file too large', {
      filename,
      size: buffer.length,
    })
    return null
  }

  // Generate storage path matching the pattern from attachment-service.ts
  const fileId = crypto.randomUUID()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${orgId}/${threadId || 'unthreaded'}/${fileId}/${safeFilename}`

  // Upload directly to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    logger.warn('[extract-file-parts] Storage upload failed', {
      filename,
      error: uploadError.message,
    })
    return null
  }

  // Create attachment record (status 'ready' since upload is already done)
  const { data: attachment, error: dbError } = await supabase
    .from('attachments')
    .insert({
      id: fileId,
      org_id: orgId,
      user_id: userId,
      thread_id: threadId || null,
      filename,
      mime_type: mimeType,
      size: buffer.length,
      storage_path: storagePath,
      status: 'ready',
    })
    .select('id')
    .single()

  if (dbError || !attachment) {
    logger.warn('[extract-file-parts] Failed to create attachment record', {
      filename,
      error: dbError?.message,
    })
    // Try to clean up the uploaded file
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {})
    return null
  }

  return attachment.id
}

/**
 * Process an HTTP(S) URL file part: create an attachment record that
 * references the external URL. The file content is not re-uploaded;
 * instead the URL is stored as the storage_path for later retrieval.
 */
async function processUrlFile(
  part: FilePart,
  filename: string,
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId?: string,
): Promise<string | null> {
  const mimeType = part.mediaType

  // Only allow known MIME types
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    logger.warn('[extract-file-parts] URL file has disallowed MIME type', {
      filename,
      mimeType,
    })
    return null
  }

  const fileId = crypto.randomUUID()

  // Store external URL in source_url, not storage_path — storage_path is
  // expected to be a Supabase Storage key by getDownloadUrl(). Using
  // storage_path: null signals this is an external reference.
  const { data: attachment, error: dbError } = await supabase
    .from('attachments')
    .insert({
      id: fileId,
      org_id: orgId,
      user_id: userId,
      thread_id: threadId || null,
      filename,
      mime_type: mimeType,
      size: 0, // Unknown for URL references
      storage_path: null,
      source_url: part.url,
      status: 'ready',
    })
    .select('id')
    .single()

  if (dbError || !attachment) {
    logger.warn('[extract-file-parts] Failed to create URL attachment record', {
      filename,
      error: dbError?.message,
    })
    return null
  }

  return attachment.id
}
