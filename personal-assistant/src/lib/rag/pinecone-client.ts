/**
 * Pinecone Vector Database Client
 *
 * Singleton client for vector storage and retrieval.
 * Graceful degradation: returns null/empty when PINECONE_API_KEY is not set.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import type { PineconeMetadata, SparseVector } from './types'
import { logger } from '@/lib/core/logger'

let pineconeClient: Pinecone | null = null

function getPineconeClient(): Pinecone | null {
  if (pineconeClient) return pineconeClient

  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) return null

  try {
    pineconeClient = new Pinecone({ apiKey })
    logger.info('Pinecone client initialized', {
      indexName: process.env.PINECONE_INDEX_NAME || 'bitbit-rag',
      dimension: 1024,
      metric: 'dotproduct',
    })
    return pineconeClient
  } catch (err) {
    logger.warn('Failed to initialize Pinecone client', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function getIndex() {
  const client = getPineconeClient()
  if (!client) return null
  return client.Index(process.env.PINECONE_INDEX_NAME || 'bitbit-rag')
}

/**
 * Build a metadata filter object for Pinecone queries.
 */
export function buildMetadataFilter(options: {
  channel?: string
  sender?: string
  dateFrom?: string
  dateTo?: string
}): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {}

  if (options.channel) {
    filter.channel = { $eq: options.channel }
  }

  if (options.sender) {
    filter.sender = { $eq: options.sender }
  }

  if (options.dateFrom || options.dateTo) {
    const dateRange: Record<string, string> = {}
    if (options.dateFrom) dateRange.$gte = options.dateFrom
    if (options.dateTo) dateRange.$lte = options.dateTo
    filter.received_at = dateRange
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

/**
 * Query Pinecone for vectors matching the embedding and metadata filters.
 * Supports hybrid search with optional sparse vectors.
 *
 * Hybrid search combines:
 * - Dense vectors (semantic similarity via embeddings)
 * - Sparse vectors (keyword/BM25 matching)
 * - Uses alpha parameter to weight: alpha * dense + (1 - alpha) * sparse
 */
export async function queryPinecone(
  embedding: number[],
  namespace: string,
  options: {
    topK?: number
    channel?: string
    sender?: string
    dateFrom?: string
    dateTo?: string
    sparseVector?: SparseVector
    alpha?: number // Weight for dense vs sparse (0.7 = 70% dense, 30% sparse)
  }
): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
  const index = getIndex()
  if (!index) return []

  const filter = buildMetadataFilter({
    channel: options.channel,
    sender: options.sender,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  })

  try {
    const queryOptions: Record<string, unknown> = {
      vector: embedding,
      topK: options.topK ?? 30,
      includeMetadata: true,
      ...(filter ? { filter } : {}),
    }

    // Add sparse vector for hybrid search if available
    if (options.sparseVector && options.sparseVector.indices.length > 0) {
      queryOptions.sparseVector = options.sparseVector
      // alpha: 0.7 = 70% weight on dense, 30% on sparse (default)
      queryOptions.alpha = options.alpha ?? 0.7
    }

    const response = await index.namespace(namespace).query(queryOptions as any)

    return (response.matches || []).map((match) => ({
      id: match.id,
      score: match.score ?? 0,
      metadata: (match.metadata as Record<string, unknown>) ?? {},
    }))
  } catch (err) {
    logger.warn('Pinecone query failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Upsert vectors into Pinecone with metadata and optional sparse vectors.
 * Batches in groups of 100 per Pinecone recommendation.
 *
 * Supports hybrid search: dense vectors + sparse vectors for keyword matching.
 */
export async function upsertVectors(
  vectors: Array<{
    id: string
    values: number[]
    metadata: PineconeMetadata
    sparseValues?: SparseVector
  }>,
  namespace: string
): Promise<{ upserted: number; failed: number; errors: string[] }> {
  const index = getIndex()
  if (!index) {
    logger.warn('Cannot upsert vectors: Pinecone not configured')
    return { upserted: 0, failed: vectors.length, errors: ['Pinecone not configured'] }
  }

  const errors: string[] = []
  const batchSize = 100
  let upserted = 0

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize)
    try {
      await index.namespace(namespace).upsert({
        records: batch.map((v) => {
          const record: any = {
            id: v.id,
            values: v.values,
            metadata: v.metadata as unknown as Record<string, string | number | boolean>,
          }

          // Add sparse vector if available (for hybrid search)
          if (v.sparseValues && v.sparseValues.indices.length > 0) {
            record.sparseValues = v.sparseValues
          }

          return record
        }),
      })
      upserted += batch.length
      logger.debug('Upserted vector batch', {
        batchIndex: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        hasSparseVectors: batch.some(v => v.sparseValues && v.sparseValues.indices.length > 0),
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errMsg}`)
      logger.warn('Upsert batch failed', { error: errMsg })
    }
  }

  return { upserted, failed: vectors.length - upserted, errors }
}

/**
 * Delete vectors from Pinecone by IDs.
 */
export async function deletePineconeVectors(ids: string[], namespace: string): Promise<boolean> {
  const index = getIndex()
  if (!index) return false

  try {
    await index.namespace(namespace).deleteMany(ids)
    logger.debug('Deleted vectors from Pinecone', { count: ids.length })
    return true
  } catch (err) {
    logger.warn('Failed to delete vectors from Pinecone', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Delete vectors by metadata filter (e.g., all chunks for specific message IDs).
 */
export async function deletePineconeVectorsByFilter(
  namespace: string,
  filter: Record<string, unknown>
): Promise<boolean> {
  const index = getIndex()
  if (!index) return false

  try {
    await index.namespace(namespace).deleteMany({ filter })
    logger.debug('Deleted vectors from Pinecone by filter')
    return true
  } catch (err) {
    logger.warn('Failed to delete vectors from Pinecone by filter', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
