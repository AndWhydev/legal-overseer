/**
 * In-memory LRU Search Result Cache
 *
 * Caches Pinecone search results keyed by a SHA-256 hash of (query + filters + orgId).
 * TTL: 5 minutes. Max size: 500 entries (LRU eviction).
 *
 * Invalidate per-org when new embeddings are upserted to avoid stale results.
 */

import { createHash } from 'crypto'
import type { SearchOptions, RetrievedChunk } from '../rag/types'

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_SIZE = 500
const TTL_MS = 5 * 60 * 1000 // 5 minutes

// ─── Internal Types ───────────────────────────────────────────────────────────

interface CacheEntry {
  results: RetrievedChunk[]
  expiresAt: number
  orgId: string
}

// ─── LRU Map ─────────────────────────────────────────────────────────────────

// Map preserves insertion order; we re-insert on access to keep LRU order.
const cache = new Map<string, CacheEntry>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from search options.
 * Uses SHA-256 so key length is always 64 chars regardless of query size.
 */
export function buildCacheKey(options: SearchOptions): string {
  const parts = [
    options.orgId,
    options.query,
    options.channel ?? '',
    options.sender ?? '',
    options.dateFrom ?? '',
    options.dateTo ?? '',
    String(options.topK ?? 10),
  ]
  return createHash('sha256').update(parts.join('\x00')).digest('hex')
}

/**
 * Evict the oldest entry to stay within MAX_SIZE.
 * Map.keys() returns insertion order — first key is oldest.
 */
function evictOldest(): void {
  const firstKey = cache.keys().next().value
  if (firstKey !== undefined) {
    cache.delete(firstKey)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve cached search results.
 * Returns null on cache miss or expired entry.
 */
export function getCachedSearch(key: string): RetrievedChunk[] | null {
  const entry = cache.get(key)
  if (!entry) return null

  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }

  // Re-insert to mark as recently used (LRU)
  cache.delete(key)
  cache.set(key, entry)

  return entry.results
}

/**
 * Store search results in the cache.
 * Evicts oldest entry if at capacity.
 */
export function setCachedSearch(key: string, results: RetrievedChunk[], orgId: string): void {
  // Evict expired entries opportunistically (cheap scan skipped — too slow at 500 entries)
  if (cache.size >= MAX_SIZE) {
    evictOldest()
  }

  // If key already exists, delete first to update LRU order
  if (cache.has(key)) {
    cache.delete(key)
  }

  cache.set(key, {
    results,
    expiresAt: Date.now() + TTL_MS,
    orgId,
  })
}

/**
 * Invalidate all cached entries for a specific org.
 * Call this after new embeddings are upserted to prevent stale results.
 */
export function invalidateOrg(orgId: string): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.orgId === orgId) {
      cache.delete(key)
    }
  }
}

/**
 * Return cache stats (for observability / debug endpoints).
 */
export function getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return { size: cache.size, maxSize: MAX_SIZE, ttlMs: TTL_MS }
}

/**
 * Clear the entire cache (useful for testing).
 */
export function clearCache(): void {
  cache.clear()
}
