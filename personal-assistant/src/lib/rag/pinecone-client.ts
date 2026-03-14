/**
 * Pinecone Vector Database Client
 *
 * Singleton client for vector storage and retrieval.
 * Graceful degradation: returns null/empty when PINECONE_API_KEY is not set.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import type { PineconeMetadata } from './types'
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

function getIndex() {
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
    const response = await index.namespace(namespace).query({
      vector: embedding,
      topK: options.topK ?? 30,
      includeMetadata: true,
      ...(filter ? { filter } : {}),
    })

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
 * Upsert vectors into Pinecone with metadata.
 * Batches in groups of 100 per Pinecone recommendation.
 */
export async function upsertVectors(
  vectors: Array<{ id: string; values: number[]; metadata: PineconeMetadata }>,
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
        records: batch.map((v) => ({
          id: v.id,
          values: v.values,
          metadata: v.metadata as unknown as Record<string, string | number | boolean>,
        })),
      })
      upserted += batch.length
      logger.debug('Upserted vector batch', {
        batchIndex: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
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
