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
    // Phase 1: Chunk all documents
    const allChunks = docs.flatMap(doc => chunkText(doc.content, doc.metadata))

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

    // Phase 3: Build vectors with metadata (include content for retrieval)
    const vectors: Array<{ id: string; values: number[]; metadata: PineconeMetadata }> = []

    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i]
      const chunk = allChunks[i]

      vectors.push({
        id: chunk.chunkId,
        values: embedding,
        metadata: {
          ...chunk.metadata,
          content: chunk.text, // Store content in metadata for retrieval
        },
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
