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
import { extractEntities } from './entity-extractor'
import { populateGraphFromExtraction } from './graph-populator'
import { computeContentHash, checkExistingHashesBatch } from './content-hasher'
import { invalidateOrg } from '@/lib/cache/search-cache'
import type { VectorDocument, EmbedUpsertResult, PineconeMetadata } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Embed and upsert documents to Pinecone.
 *
 * Process:
 * 1. Chunk all documents (message-as-atomic-unit or paragraph-boundary)
 * 2. Embed all chunks via Voyage-3.5
 * 3. Upsert vectors to Pinecone (namespace = orgId, batched)
 * 4. Fire-and-forget entity extraction for knowledge graph enrichment
 *
 * Graceful degradation: if Voyage or Pinecone unavailable, returns all failed.
 * Entity extraction failures never block the embedding pipeline.
 *
 * @param docs Documents to embed and upsert
 * @param supabase Optional Supabase client for entity extraction context
 */
export async function embedAndUpsert(
  docs: VectorDocument[],
  supabase?: SupabaseClient
): Promise<EmbedUpsertResult> {
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

    // Phase 2a: Compute content hashes and check for duplicates
    const chunkHashes = allChunks.map(c => ({
      index: allChunks.indexOf(c),
      hash: computeContentHash(c.text),
    }))

    // Group by org and check for existing hashes
    const hashChecksByOrg = new Map<string, { index: number; hash: string }[]>()
    for (const ch of chunkHashes) {
      const orgId = allChunks[ch.index].metadata.org_id
      const existing = hashChecksByOrg.get(orgId) ?? []
      existing.push(ch)
      hashChecksByOrg.set(orgId, existing)
    }

    const existingHashesByOrg = new Map<string, Map<string, boolean>>()
    for (const [orgId, checks] of hashChecksByOrg) {
      const hashes = checks.map(c => c.hash)
      const existing = await checkExistingHashesBatch(orgId, hashes)
      existingHashesByOrg.set(orgId, existing)
    }

    // Separate chunks into: skip (already exists) and embed (new or changed)
    const chunksToEmbed: Array<{ chunk: (typeof allChunks)[0]; originalIndex: number }> = []
    const chunksToSkip: Array<{ originalIndex: number; hash: string }> = []

    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i]
      const hash = chunkHashes[i].hash
      const orgId = chunk.metadata.org_id
      const exists = existingHashesByOrg.get(orgId)?.get(hash) ?? false

      if (exists) {
        chunksToSkip.push({ originalIndex: i, hash })
      } else {
        chunksToEmbed.push({ chunk, originalIndex: i })
      }
    }

    logger.info('[embedding-service] Deduplication analysis', {
      total: allChunks.length,
      willEmbed: chunksToEmbed.length,
      willSkip: chunksToSkip.length,
      skipPercentage: chunksToSkip.length > 0 ? Math.round((chunksToSkip.length / allChunks.length) * 100) : 0,
    })

    // Phase 2: Embed via Voyage-3.5 (only new/changed chunks)
    let embeddings: number[][] | null = []
    if (chunksToEmbed.length > 0) {
      const texts = chunksToEmbed.map(c => c.chunk.text)
      embeddings = await embedDocuments(texts)

      // Check for failures
      if (!embeddings || embeddings.length === 0) {
        result.failed = docs.length
        result.errors.push('All embeddings failed')
        return result
      }
    }

    // Phase 3: Build vectors with metadata + sparse vectors for hybrid search
    const vectors: Array<{
      id: string
      values: number[]
      metadata: PineconeMetadata
      sparseValues?: { indices: number[]; values: number[] }
    }> = []

    // Map embedded chunks back to original positions with their embeddings
    for (let i = 0; i < chunksToEmbed.length; i++) {
      const embedding = embeddings[i]
      const { chunk } = chunksToEmbed[i]
      const hash = chunkHashes[chunksToEmbed[i].originalIndex].hash

      // Generate sparse vector for BM25-style hybrid search
      const sparseVector = encodeSparseVector(chunk.text)

      vectors.push({
        id: chunk.chunkId,
        values: embedding,
        metadata: {
          ...chunk.metadata,
          content: chunk.text, // Store content in metadata for retrieval
          content_hash: hash, // Store hash for future deduplication
        },
        sparseValues: sparseVector.indices.length > 0 ? sparseVector : undefined,
      })
    }

    // Log stats on skipped chunks
    if (chunksToSkip.length > 0) {
      logger.debug('[embedding-service] Skipped re-embedding unchanged chunks', {
        count: chunksToSkip.length,
        estimatedCostSavings: `${Math.round((chunksToSkip.length / allChunks.length) * 100)}%`,
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

      // Invalidate search cache for this org after successful upsert
      if (upsertResult.upserted > 0) {
        invalidateOrg(orgId)
        logger.debug('[embedding-service] Invalidated search cache', { orgId })
      }

      // Fire-and-forget entity extraction + graph population
      if (supabase && result.embedded > 0) {
        for (const doc of docs.filter((d) => d.orgId === orgId)) {
          extractEntities(doc.content, orgId, supabase)
            .then((extraction) => {
              if (extraction.mentions.length > 0) {
                return populateGraphFromExtraction(extraction, orgId, supabase, {
                  messageId: doc.messageId,
                  channel: doc.metadata.channel ?? 'unknown',
                  senderName: doc.metadata.sender,
                  subject: doc.metadata.subject,
                  timestamp: doc.metadata.received_at,
                })
              }
            })
            .catch((err) =>
              logger.debug('[embedding-service] Entity extraction/graph population failed (non-critical):', {
                error: err instanceof Error ? err.message : String(err),
                orgId,
              })
            )
        }
      }
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
