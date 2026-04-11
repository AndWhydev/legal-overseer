/**
 * Content Hashing & Deduplication for RAG Pipeline
 *
 * Prevents re-embedding of unchanged chunks by computing content hashes
 * and checking if equivalent content already exists in Pinecone.
 * Expected savings: ~70% reduction in Voyage API calls after initial backfill.
 */

import { createHash } from 'crypto'
import { getIndex } from './pinecone-client'
import { logger } from '@/lib/core/logger'
import type { Index } from '@pinecone-database/pinecone'

/**
 * Compute SHA256 hash of chunk text.
 * Returns first 16 characters of hex hash for metadata storage.
 *
 * @param text Chunk text content
 * @returns 16-char hex hash string
 */
export function computeContentHash(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex')
  return hash.slice(0, 16)
}

/**
 * Check if content with this hash already exists in Pinecone.
 * Queries metadata for matching content_hash to skip re-embedding.
 *
 * @param orgId Organization ID (Pinecone namespace)
 * @param contentHash Content hash to check
 * @returns true if hash exists in Pinecone, false otherwise
 */
export async function checkExistingHash(orgId: string, contentHash: string): Promise<boolean> {
  const index = getIndex()
  if (!index) {
    logger.debug('[content-hasher] Pinecone not configured, skipping hash check')
    return false
  }

  try {
    // Query with a simple metadata filter for content_hash
    // Use a dummy vector query with topK=1 to check if hash exists
    const dummyVector = new Array(1024).fill(0)

    const response = await index.namespace(orgId).query({
      vector: dummyVector,
      topK: 1,
      includeMetadata: true,
      filter: {
        content_hash: { $eq: contentHash },
      },
    })

    // If we get any matches, the hash already exists
    const exists = (response.matches?.length ?? 0) > 0
    logger.debug('[content-hasher] Hash existence check', {
      exists,
      contentHash: contentHash.slice(0, 8) + '...',
    })

    return exists
  } catch (err) {
    // On error, proceed with embedding (safe fallback)
    logger.warn('[content-hasher] Hash check failed, proceeding with embedding', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Check if multiple hashes exist in Pinecone (batch operation).
 * More efficient for bulk deduplication checks.
 *
 * @param orgId Organization ID (Pinecone namespace)
 * @param contentHashes Array of content hashes to check
 * @returns Map of contentHash -> exists boolean
 */
export async function checkExistingHashesBatch(
  orgId: string,
  contentHashes: string[]
): Promise<Map<string, boolean>> {
  const index = getIndex()
  const result = new Map<string, boolean>()

  if (!index) {
    logger.debug('[content-hasher] Pinecone not configured, returning all as non-existing')
    contentHashes.forEach(hash => result.set(hash, false))
    return result
  }

  if (contentHashes.length === 0) {
    return result
  }

  try {
    // Query with filter for any of the hashes (using $in operator).
    // Cap topK at 10000 (Pinecone maximum) to avoid API errors.
    const dummyVector = new Array(1024).fill(0)
    const topK = Math.min(contentHashes.length, 10000)

    const response = await index.namespace(orgId).query({
      vector: dummyVector,
      topK,
      includeMetadata: true,
      filter: {
        content_hash: { $in: contentHashes },
      },
    })

    // Build map of found hashes
    const foundHashes = new Set<string>()
    if (response.matches) {
      for (const match of response.matches) {
        const hash = (match.metadata?.content_hash as string) ?? null
        if (hash) {
          foundHashes.add(hash)
        }
      }
    }

    // Return all requested hashes with their existence status
    contentHashes.forEach(hash => {
      result.set(hash, foundHashes.has(hash))
    })

    logger.debug('[content-hasher] Batch hash check complete', {
      total: contentHashes.length,
      found: foundHashes.size,
    })

    return result
  } catch (err) {
    logger.warn('[content-hasher] Batch hash check failed, treating all as non-existing', {
      error: err instanceof Error ? err.message : String(err),
    })
    // On error, treat all as non-existing (safe fallback - will re-embed)
    contentHashes.forEach(hash => result.set(hash, false))
    return result
  }
}
