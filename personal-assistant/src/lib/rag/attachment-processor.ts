/**
 * Attachment Text Extraction Service
 *
 * Processes file attachments and extracts text for RAG pipeline ingestion.
 * Supports PDF, DOCX, TXT, and CSV formats with a 50KB text limit per attachment.
 */

import { logger } from '@/lib/core/logger'

/**
 * Extract text from a file buffer based on MIME type.
 *
 * Supported formats:
 * - application/pdf (via pdf-parse)
 * - application/vnd.openxmlformats-officedocument.wordprocessingml.document (via mammoth)
 * - text/plain (direct)
 * - text/csv (direct)
 * - image/* (skipped, returns empty string)
 *
 * @param buffer File content as Buffer
 * @param mimeType MIME type of the file
 * @returns Extracted text (max 50KB), or empty string if unsupported/skipped
 */
export async function processAttachment(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    // Guard against excessively large buffers (100MB cap to prevent OOM)
    const maxBufferSize = 100 * 1024 * 1024
    if (buffer.length > maxBufferSize) {
      logger.warn('[attachment-processor] Buffer exceeds 100MB limit, skipping', {
        mimeType,
        bufferSize: buffer.length,
      })
      return ''
    }

    // Skip images
    if (mimeType.startsWith('image/')) {
      logger.debug('[attachment-processor] Skipping image file', { mimeType })
      return ''
    }

    let extractedText = ''

    // Handle PDF
    if (mimeType === 'application/pdf') {
      extractedText = await extractPdfText(buffer)
    }
    // Handle DOCX
    else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      extractedText = await extractDocxText(buffer)
    }
    // Handle plain text and CSV
    else if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      extractedText = buffer.toString('utf-8')
    }
    // Unsupported format
    else {
      logger.warn('[attachment-processor] Unsupported MIME type', { mimeType })
      return ''
    }

    // Enforce 50KB limit (compare byte length, not character count,
    // since multi-byte UTF-8 characters inflate actual size)
    const maxBytes = 50 * 1024
    const actualBytes = Buffer.byteLength(extractedText, 'utf-8')
    if (actualBytes > maxBytes) {
      logger.warn('[attachment-processor] Text exceeds 50KB limit, truncating', {
        mimeType,
        originalBytes: actualBytes,
      })
      // Truncate by encoding to buffer and slicing, then decode back
      // to avoid splitting multi-byte characters
      const buf = Buffer.from(extractedText, 'utf-8')
      extractedText = buf.subarray(0, maxBytes).toString('utf-8')
      // Remove potential trailing incomplete multi-byte character
      // by re-encoding and checking — simplest approach: just trim to
      // last valid codepoint boundary
      extractedText = extractedText.replace(/[\uFFFD]$/, '')
    }

    return extractedText
  } catch (error) {
    logger.error('[attachment-processor] Failed to process attachment', {
      mimeType,
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

/**
 * Extract text from PDF buffer using pdf-parse.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Lazy load pdf-parse to avoid runtime dependency if not used
    const pdfParseModule = await import('pdf-parse')
    const pdfParse = ((pdfParseModule as unknown as { default?: (input: Buffer) => Promise<{ text?: string }> }).default ?? pdfParseModule) as (input: Buffer) => Promise<{ text?: string }>
    const data = await pdfParse(buffer)

    // Concatenate all page text
    const fullText = data.text || ''
    return fullText
  } catch (error) {
    logger.error('[attachment-processor] PDF parsing failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

/**
 * Extract text from DOCX buffer using mammoth.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // Lazy load mammoth to avoid runtime dependency if not used
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })

    return result.value || ''
  } catch (error) {
    logger.error('[attachment-processor] DOCX parsing failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}
