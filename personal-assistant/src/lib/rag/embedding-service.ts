/**
 * Embedding & Upsert Service for RAG Pipeline
 *
 * Orchestrates the write path: chunk → embed via Voyage-3.5 → upsert to Pinecone.
 * Uses actual exported functions from pinecone-client and voyage-client.
 */

import { logger } from '@/lib/core/logger'
import { chunkText } from './chunker'
import { embedDocuments } from './voyage-client'
import { upsertVectors, deletePineconeVectorsByFilter } from './pinecone-client'
import { encodeSparseVector } from './sparse-encoder'
import { processAttachment } from './attachment-processor'
import type { VectorDocument, EmbedUpsertResult, PineconeMetadata } from './types'

/**
 * Embed and upsert documents to Pinecone.
 *
 * Process:
 * 1. Chunk all documents (message-as-atomic-unit or paragraph-boundary)
 * 2. Embed all chunks via Voyage-3.5
 * 3. Upsert vectors to Pinecone (namespace = orgId, batched)
 *
 * Graceful degradation: if Voyage or Pinecone unavailable, returns all failed.
 */
export async function embedAndUpsert(docs: VectorDocument[]): Promise<EmbedUpsertResult> {
  const result: EmbedUpsertResult = { embedded: 0, failed: 0, errors: [] }

  if (docs.length === 0) return result

  // Check env vars early
  if (!process.env.PINECONE_API_KEY || !process.env.VOYAGE_API_KEY) {
    result.failed = docs.length
    result.errors.push('PINECONE_API_KEY or VOYAGE_API_KEY not configured')
    return result
  }

  try {
    // Phase 1a: Process attachments and collect attachment chunks
    const attachmentChunks: Array<{ text: string; metadata: PineconeMetadata; chunkId: string }> = []

    for (const doc of docs) {
      if (doc.attachments && doc.attachments.length > 0) {
        for (let attachIdx = 0; attachIdx < doc.attachments.length; attachIdx++) {
          const attachment = doc.attachments[attachIdx]
          try {
            const extractedText = await processAttachment(attachment.buffer, attachment.mimeType)

            if (extractedText.length > 0) {
              // Chunk the attachment text with metadata prepend
              const attachmentMetadata: PineconeMetadata = {
                ...doc.metadata,
                attachment_name: attachment.filename,
                is_full_body: true,
              }

              const chunks = chunkText(extractedText, attachmentMetadata)
              attachmentChunks.push(...chunks)

              logger.debug('[embedding-service] Processed attachment', {
                messageId: doc.messageId,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                chunks: chunks.length,
              })
            }
          } catch (attachErr) {
            logger.warn('[embedding-service] Attachment processing failed', {
              messageId: doc.messageId,
              filename: attachment.filename,
              error: attachErr instanceof Error ? attachErr.message : String(attachErr),
            })
          }
        }
      }
    }

    // Phase 1: Chunk all documents (message content + attachments)
    const allChunks = [
      ...docs.flatMap(doc => chunkText(doc.content, doc.metadata)),
      ...attachmentChunks,
    ]

    if (allChunks.length === 0) {
      result.failed = docs.length
      result.errors.push('No chunks generated from documents')
      return result
    }

    logger.info('[embedding-service] Chunked documents', {
      docs: docs.length,
      chunks: allChunks.length,
    })

    // Phase 2: Embed via Voyage-3.5
    const texts = allChunks.map(c => c.text)
    const embeddings = await embedDocuments(texts)

    // Check for failures
    if (!embeddings || embeddings.length === 0) {
      result.failed = docs.length
      result.errors.push('All embeddings failed')
      return result
    }

    // Phase 3: Build vectors with metadata + sparse vectors for hybrid search
    const vectors: Array<{
      id: string
      values: number[]
      metadata: PineconeMetadata
      sparseValues?: { indices: number[]; values: number[] }
    }> = []

    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i]
      const chunk = allChunks[i]

      // Generate sparse vector for BM25-style hybrid search
      const sparseVector = encodeSparseVector(chunk.text)

      vectors.push({
        id: chunk.chunkId,
        values: embedding,
        metadata: {
          ...chunk.metadata,
          content: chunk.text, // Store content in metadata for retrieval
        },
        sparseValues: sparseVector.indices.length > 0 ? sparseVector : undefined,
      })
    }

    // Phase 4: Group by org and upsert
    const vectorsByOrg = new Map<string, typeof vectors>()
    for (const vec of vectors) {
      const orgId = vec.metadata.org_id
      const group = vectorsByOrg.get(orgId) ?? []
      group.push(vec)
      vectorsByOrg.set(orgId, group)
    }

    for (const [orgId, orgVectors] of vectorsByOrg) {
      const upsertResult = await upsertVectors(orgVectors, orgId)
      result.embedded += upsertResult.upserted
      result.failed += upsertResult.failed
      result.errors.push(...upsertResult.errors)
    }

    logger.info('[embedding-service] Pipeline complete', {
      embedded: result.embedded,
      failed: result.failed,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    result.failed = docs.length
    result.errors.push(`Pipeline error: ${errMsg}`)
    logger.error('[embedding-service] Pipeline failed:', err)
  }

  return result
}

/**
 * Delete all vectors for given message IDs from Pinecone.
 * Uses metadata filter to find all chunks belonging to each message.
 */
export async function deleteMessageVectors(orgId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return

  try {
    await deletePineconeVectorsByFilter(orgId, {
      message_id: { $in: messageIds },
    })
    logger.info('[embedding-service] Deleted vectors', { orgId, messageIds: messageIds.length })
  } catch (err) {
    logger.error('[embedding-service] Delete failed:', err)
  }
}
