/**
 * Attachment Content Block Builder
 *
 * Converts attachment records from the database into Anthropic API
 * ContentBlockParam arrays for multimodal user messages.
 *
 * Image attachments -> URL image content blocks (Claude Vision)
 * PDF attachments -> URL document content blocks
 * Text documents -> Extracted text content blocks (DOCX, CSV, TXT)
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processAttachment } from '@/lib/rag/attachment-processor'
import { STORAGE_BUCKET, DOWNLOAD_URL_EXPIRY } from './constants'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttachmentRecord {
  id: string
  filename: string
  mime_type: string
  size: number
  storage_path: string
  extracted_text: string | null
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build Anthropic ContentBlockParam[] from attachment records.
 *
 * For each attachment:
 * - Images: signed URL image content block (Claude Vision)
 * - PDFs: signed URL document content block
 * - Text docs: extracted text content block (DOCX, CSV, TXT)
 *
 * Failures for individual attachments are logged and skipped — the
 * message still gets sent with whatever blocks succeed.
 */
export async function buildAttachmentContentBlocks(
  supabase: SupabaseClient,
  attachments: AttachmentRecord[]
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = []

  for (const attachment of attachments) {
    try {
      const block = await buildSingleBlock(supabase, attachment)
      if (block) {
        blocks.push(block)
      }
    } catch (err) {
      logger.warn('[content-blocks] Failed to build block for attachment, skipping', {
        attachmentId: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mime_type,
        error: err instanceof Error ? err.message : String(err),
      })
      // Skip this attachment — don't fail the entire message
    }
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Per-attachment block builder
// ---------------------------------------------------------------------------

async function buildSingleBlock(
  supabase: SupabaseClient,
  attachment: AttachmentRecord
): Promise<Anthropic.ContentBlockParam | null> {
  const { mime_type, filename, storage_path, extracted_text } = attachment

  // ── Images: URL content block for Claude Vision ──
  if (mime_type.startsWith('image/')) {
    const signedUrl = await getSignedUrl(supabase, storage_path)
    if (!signedUrl) return null

    // Map MIME type to Anthropic's accepted media types
    const mediaType = mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    return {
      type: 'image',
      source: {
        type: 'url',
        url: signedUrl,
      },
    } as Anthropic.ImageBlockParam
  }

  // ── PDFs: URL document content block ──
  if (mime_type === 'application/pdf') {
    const signedUrl = await getSignedUrl(supabase, storage_path)
    if (!signedUrl) return null

    return {
      type: 'document',
      source: {
        type: 'url',
        url: signedUrl,
      },
      title: filename,
    } as Anthropic.DocumentBlockParam
  }

  // ── Text documents: extracted text content block (DOCX, CSV, TXT) ──
  if (
    mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime_type === 'text/plain' ||
    mime_type === 'text/csv' ||
    mime_type === 'text/markdown'
  ) {
    let text = extracted_text

    // If no extracted text cached yet, download and extract
    if (!text) {
      text = await extractAndCache(supabase, attachment)
    }

    if (!text) {
      logger.warn('[content-blocks] No text extracted for document, skipping', {
        attachmentId: attachment.id,
        filename,
      })
      return null
    }

    return {
      type: 'text',
      text: `[Attached file: ${filename}]\n\n${text}`,
    } as Anthropic.TextBlockParam
  }

  logger.warn('[content-blocks] Unsupported MIME type, skipping', {
    attachmentId: attachment.id,
    mimeType: mime_type,
  })
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSignedUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_URL_EXPIRY)

  if (error || !data) {
    logger.warn('[content-blocks] Failed to create signed URL', {
      storagePath,
      error: error?.message,
    })
    return null
  }

  return data.signedUrl
}

/**
 * Download file from storage, extract text, and fire-and-forget update
 * the extracted_text column for future use.
 */
async function extractAndCache(
  supabase: SupabaseClient,
  attachment: AttachmentRecord
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(attachment.storage_path)

    if (error || !data) {
      logger.warn('[content-blocks] Failed to download attachment for text extraction', {
        attachmentId: attachment.id,
        error: error?.message,
      })
      return null
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    const text = await processAttachment(buffer, attachment.mime_type)

    if (!text) return null

    // Fire-and-forget: cache extracted text for future use
    supabase
      .from('attachments')
      .update({ extracted_text: text })
      .eq('id', attachment.id)
      .then(({ error: updateErr }) => {
        if (updateErr) {
          logger.warn('[content-blocks] Failed to cache extracted text', {
            attachmentId: attachment.id,
            error: updateErr.message,
          })
        }
      })

    return text
  } catch (err) {
    logger.warn('[content-blocks] Text extraction failed', {
      attachmentId: attachment.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
