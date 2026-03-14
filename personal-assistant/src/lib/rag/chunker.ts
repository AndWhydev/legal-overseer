/**
 * Text Chunking Service for RAG Pipeline
 *
 * Splits documents into embeddings-friendly chunks with strategic boundaries
 * and metadata preservation. Follows message-as-atomic-unit strategy for
 * messages under 500 tokens.
 */

import type { PineconeMetadata, TextChunk } from './types'

/**
 * Estimates token count using character length approximation.
 * Matches the pattern used elsewhere in the codebase.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

/**
 * Formats a date from ISO string to readable format.
 * Used in chunk metadata prepend.
 */
function formatDateForChunk(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoDate
  }
}

/**
 * Creates a metadata prepend string for chunk content.
 * Includes sender, subject, date, and channel information.
 */
function createMetadataPrepend(metadata: PineconeMetadata): string {
  const parts: string[] = []

  if (metadata.sender) {
    parts.push(`From: ${metadata.sender}`)
  }

  if (metadata.subject) {
    parts.push(`Subject: ${metadata.subject}`)
  }

  const formattedDate = formatDateForChunk(metadata.received_at)
  parts.push(`Date: ${formattedDate}`)

  if (metadata.channel) {
    parts.push(`Channel: ${metadata.channel}`)
  }

  if (parts.length === 0) {
    return ''
  }

  return parts.join(' | ') + '\n\n'
}

/**
 * Splits text by paragraph boundaries, preserving semantic cohesion.
 */
function splitByParagraphBoundaries(text: string): string[] {
  // Split by double newlines (paragraphs), then by single newlines (lines)
  const paragraphs = text.split(/\n\n+/)
  const lines = paragraphs.flatMap((p) => p.split(/\n+/))
  return lines.filter((line) => line.trim().length > 0)
}

/**
 * Chunks text with 50-token overlap between chunks.
 * Returns an array of text chunks that can be embedded.
 */
function chunkWithOverlap(
  text: string,
  targetTokens: number = 1024
): string[] {
  const overlap = 50 // tokens
  const overlapChars = Math.ceil(overlap * 3.5) // rough estimate
  const targetChars = Math.ceil(targetTokens * 3.5)

  const lines = splitByParagraphBoundaries(text)
  const chunks: string[] = []
  let currentChunk = ''

  for (const line of lines) {
    const potentialChunk = currentChunk
      ? `${currentChunk}\n${line}`
      : line

    const tokens = estimateTokens(potentialChunk)

    if (tokens <= targetTokens) {
      currentChunk = potentialChunk
    } else {
      // Current chunk would exceed target, save it and start new one
      if (currentChunk) {
        chunks.push(currentChunk)
      }
      currentChunk = line
    }
  }

  // Push remaining chunk
  if (currentChunk) {
    chunks.push(currentChunk)
  }

  // Apply overlap: if we have multiple chunks, add tail of previous to head of next
  if (chunks.length > 1) {
    const overlappedChunks: string[] = [chunks[0]]

    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1]
      const currentChunk = chunks[i]

      // Take the last N chars from previous chunk as overlap
      const overlapStart = Math.max(0, prevChunk.length - overlapChars)
      const overlap = prevChunk.substring(overlapStart)

      const combinedChunk = `${overlap}\n${currentChunk}`
      overlappedChunks.push(combinedChunk)
    }

    return overlappedChunks
  }

  return chunks
}

/**
 * Chunks text content into embeddings-friendly pieces with metadata.
 *
 * Strategy:
 * - Messages under 500 tokens: return as single atomic chunk
 * - Messages 500+ tokens: split by paragraph boundaries with 50-token overlap
 *
 * Each chunk is prepended with metadata (From, Subject, Date, Channel).
 *
 * @param text Raw text content to chunk
 * @param metadata Parent document metadata
 * @returns Array of text chunks ready for embedding
 */
export function chunkText(
  text: string,
  metadata: PineconeMetadata
): TextChunk[] {
  const tokenCount = estimateTokens(text)

  // Message-as-atomic-unit for messages under 500 tokens
  if (tokenCount < 500) {
    const metadataPrepend = createMetadataPrepend(metadata)
    const chunkText = metadataPrepend + text

    return [
      {
        text: chunkText,
        metadata: {
          ...metadata,
          chunk_index: 0,
          total_chunks: 1,
        },
        chunkId: `${metadata.message_id}#chunk0`,
      },
    ]
  }

  // For longer messages, use paragraph-boundary chunking with overlap
  const textChunks = chunkWithOverlap(text)
  const metadataPrepend = createMetadataPrepend(metadata)

  return textChunks.map((chunkText, index) => {
    const preparedText = metadataPrepend + chunkText

    return {
      text: preparedText,
      metadata: {
        ...metadata,
        chunk_index: index,
        total_chunks: textChunks.length,
      },
      chunkId: `${metadata.message_id}#chunk${index}`,
    }
  })
}
