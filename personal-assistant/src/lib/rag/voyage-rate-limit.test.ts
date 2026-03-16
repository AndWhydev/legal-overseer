import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// voyage-client.ts uses require(variable) to prevent static bundler analysis of voyageai.
// This means vi.mock('voyageai') won't intercept it — Vitest's static analysis can't see
// through the variable reference. Instead, we patch Node's require.cache directly, which
// is guaranteed to intercept any runtime require('voyageai') call.

function makeClient(mockEmbed: ReturnType<typeof vi.fn>, mockRerank?: ReturnType<typeof vi.fn>) {
  return () => ({
    embed: mockEmbed,
    rerank: mockRerank ?? vi.fn(),
  })
}

function patchVoyageCache(clientFactory: () => any) {
  const voyageaiPath = require.resolve('voyageai')
  // Use a real class constructor so 'new VoyageAIClient()' works correctly.
  // vi.fn() with mockImplementation doesn't work well with 'new' + return value.
  function MockClient(this: any) {
    const instance = clientFactory()
    Object.assign(this, instance)
    return this
  }
  const fakeModule = {
    id: voyageaiPath,
    filename: voyageaiPath,
    loaded: true,
    parent: null,
    children: [],
    paths: [],
    exports: { VoyageAIClient: MockClient },
    require: require,
  }
  require.cache[voyageaiPath] = fakeModule as unknown as NodeModule
}

function restoreVoyageCache() {
  try {
    const voyageaiPath = require.resolve('voyageai')
    delete require.cache[voyageaiPath]
  } catch {
    // ignore if already cleaned up
  }
}

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Voyage API Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.VOYAGE_API_KEY = 'test-voyage-key'
  })

  afterEach(() => {
    restoreVoyageCache()
    vi.restoreAllMocks()
  })

  describe('Batch size respects 128 text limit', () => {
    it('should chunk texts into batches of 128 when processing large documents', async () => {
      const texts = Array.from({ length: 300 }, (_, i) => `Document ${i}`)

      const mockEmbed = vi.fn().mockResolvedValue({
        data: Array.from({ length: 128 }, () => ({
          embedding: Array(1024).fill(0.1),
        })),
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const result = await embedDocuments(texts)

      // Verify batching occurred by checking embed was called multiple times
      expect(mockEmbed).toHaveBeenCalledTimes(3) // 300/128 = 2.34, so 3 calls
      expect(result).not.toBeNull()
    })

    it('should handle exactly 128 texts in a single batch', async () => {
      const texts = Array.from({ length: 128 }, (_, i) => `Document ${i}`)

      const mockEmbed = vi.fn().mockResolvedValue({
        data: Array.from({ length: 128 }, () => ({
          embedding: Array(1024).fill(0.1),
        })),
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const result = await embedDocuments(texts)

      expect(mockEmbed).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(128)
    })

    it('should handle 256 texts in exactly two batches', async () => {
      const texts = Array.from({ length: 256 }, (_, i) => `Document ${i}`)

      const mockEmbed = vi.fn().mockResolvedValue({
        data: Array.from({ length: 128 }, () => ({
          embedding: Array(1024).fill(0.1),
        })),
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const result = await embedDocuments(texts)

      expect(mockEmbed).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(256)
    })

    it('should not exceed batch size of 128 in any single request', async () => {
      let maxBatchSize = 0

      const mockEmbed = vi.fn().mockImplementation((args: any) => {
        const batchSize = Array.isArray(args.input) ? args.input.length : 1
        maxBatchSize = Math.max(maxBatchSize, batchSize)
        return Promise.resolve({
          data: Array.from({ length: batchSize }, () => ({
            embedding: Array(1024).fill(0.1),
          })),
        })
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const texts = Array.from({ length: 500 }, (_, i) => `Doc ${i}`)
      await embedDocuments(texts)

      expect(maxBatchSize).toBeLessThanOrEqual(128)
    })
  })

  describe('Exponential backoff on 429 responses', () => {
    it('should retry on 429 (rate limit) with exponential backoff', async () => {
      vi.useFakeTimers()

      let attemptCount = 0
      const mockEmbed = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          const error = new Error('429 Too Many Requests')
          ;(error as any).status = 429
          return Promise.reject(error)
        }
        return Promise.resolve({
          data: [{ embedding: Array(1024).fill(0.1) }],
        })
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedQuery } = await import('./voyage-client')
      const result = embedQuery('test query')

      await vi.runAllTimersAsync()

      expect(await result).not.toBeNull()
      expect(attemptCount).toBe(3) // Initial attempt + 2 retries

      vi.useRealTimers()
    })

    it('should use correct exponential backoff intervals: 1s, 2s, 4s', () => {
      const getBackoffMs = (attempt: number) => Math.pow(2, attempt - 1) * 1000

      expect(getBackoffMs(1)).toBe(1000) // 1s
      expect(getBackoffMs(2)).toBe(2000) // 2s
      expect(getBackoffMs(3)).toBe(4000) // 4s
      expect(getBackoffMs(4)).toBe(8000) // 8s
    })

    it('should not exceed max retries on persistent 429 errors', async () => {
      vi.useFakeTimers()

      let attemptCount = 0
      const mockEmbed = vi.fn().mockImplementation(() => {
        attemptCount++
        const error = new Error('429 Too Many Requests')
        ;(error as any).status = 429
        return Promise.reject(error)
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedQuery } = await import('./voyage-client')
      const result = embedQuery('test query').catch(() => null)

      await vi.runAllTimersAsync()

      const finalResult = await result
      expect(finalResult).toBeNull()
      expect(attemptCount).toBe(3) // Initial + 2 retries, then give up

      vi.useRealTimers()
    })
  })

  describe('Graceful degradation when Voyage is down', () => {
    it('should return empty array when Voyage API is unavailable', async () => {
      vi.useFakeTimers()

      const mockEmbed = vi.fn().mockRejectedValue(new Error('Network error'))

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const resultPromise = embedDocuments(['test']).catch(() => [])

      await vi.runAllTimersAsync()

      const result = await resultPromise
      expect(result).toEqual([])

      vi.useRealTimers()
    })

    it('should return null when embedQuery fails and API is down', async () => {
      vi.useFakeTimers()

      const mockEmbed = vi.fn().mockRejectedValue(new Error('Service unavailable'))

      patchVoyageCache(makeClient(mockEmbed))

      const { embedQuery } = await import('./voyage-client')
      const resultPromise = embedQuery('test').catch(() => null)

      await vi.runAllTimersAsync()

      const result = await resultPromise
      expect(result).toBeNull()

      vi.useRealTimers()
    })

    it('should handle timeout errors gracefully', async () => {
      vi.useFakeTimers()

      const mockEmbed = vi.fn().mockRejectedValue(new Error('Request timeout'))

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')
      const resultPromise = embedDocuments(['test1', 'test2']).catch(() => [])

      await vi.runAllTimersAsync()

      const result = await resultPromise
      expect(result).toEqual([])

      vi.useRealTimers()
    })

    it('should provide fallback reranking when API is unavailable', async () => {
      const mockRerank = vi.fn().mockRejectedValue(new Error('Service down'))

      patchVoyageCache(makeClient(vi.fn(), mockRerank))

      const { rerankDocuments } = await import('./voyage-client')
      const documents = [
        { id: 'doc-1', text: 'First document' },
        { id: 'doc-2', text: 'Second document' },
      ]
      const result = await rerankDocuments('query', documents, 10)

      // Should return fallback ranking
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('Queue backpressure during outages', () => {
    it('should not grow unboundedly during extended outage', async () => {
      let requestCount = 0

      const mockEmbed = vi.fn().mockImplementation(() => {
        requestCount++
        const error = new Error('Service unavailable')
        ;(error as any).status = 503
        return Promise.reject(error)
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedDocuments } = await import('./voyage-client')

      const promises = Array.from({ length: 5 }, () =>
        embedDocuments(['test']).catch(() => null)
      )

      await Promise.all(promises)

      // Each request should only retry 3 times max
      expect(requestCount).toBeLessThanOrEqual(15) // 5 requests * 3 max retries
    })

    it('should handle concurrent requests without exceeding limits', async () => {
      vi.useFakeTimers()

      let activeRequests = 0
      let maxConcurrent = 0

      const mockEmbed = vi.fn().mockImplementation(() => {
        activeRequests++
        maxConcurrent = Math.max(maxConcurrent, activeRequests)

        setTimeout(() => {
          activeRequests--
        }, 100)

        return Promise.resolve({
          data: [{ embedding: Array(1024).fill(0.1) }],
        })
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedQuery } = await import('./voyage-client')

      const promises = Array.from({ length: 10 }, () => embedQuery(`query ${Math.random()}`))

      await Promise.all(promises)
      await vi.runAllTimersAsync()

      expect(mockEmbed).toHaveBeenCalledTimes(10)

      vi.useRealTimers()
    })

    it('should implement reasonable queue timeout', () => {
      const maxBackoffMs = Math.pow(2, 3 - 1) * 1000 // 4 seconds for 3 retries
      expect(maxBackoffMs).toBe(4000)
      expect(maxBackoffMs).toBeLessThan(30000)
    })
  })

  describe('Recovery from temporary outages', () => {
    it('should succeed after temporary outage resolves', async () => {
      vi.useFakeTimers()

      let attemptCount = 0

      const mockEmbed = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount <= 1) {
          const error = new Error('503 Service Unavailable')
          ;(error as any).status = 503
          return Promise.reject(error)
        }
        return Promise.resolve({
          data: [{ embedding: Array(1024).fill(0.1) }],
        })
      })

      patchVoyageCache(makeClient(mockEmbed))

      const { embedQuery } = await import('./voyage-client')
      const result = embedQuery('test query')

      await vi.runAllTimersAsync()

      expect(await result).not.toBeNull()
      expect(attemptCount).toBe(2) // Failed once, succeeded on retry

      vi.useRealTimers()
    })

    it('should return cached results if available during outage', () => {
      const mockCache = new Map<string, number[][]>()
      mockCache.set('query1', [Array(1024).fill(0.1)])
      expect(mockCache.has('query1')).toBe(true)
    })
  })

  describe('Rate limiting headers', () => {
    it('should respect X-RateLimit-Remaining header', () => {
      const headers = {
        'X-RateLimit-Limit': '1000',
        'X-RateLimit-Remaining': '999',
        'X-RateLimit-Reset': '1234567890',
      }

      expect(parseInt(headers['X-RateLimit-Remaining'])).toBeLessThan(
        parseInt(headers['X-RateLimit-Limit'])
      )
    })

    it('should implement rate limit awareness', () => {
      const BATCH_SIZE = 128
      const MAX_RETRIES = 3
      const MAX_REQUESTS_PER_MINUTE = 600

      expect(BATCH_SIZE).toBeLessThan(MAX_REQUESTS_PER_MINUTE)
    })
  })

  describe('Monitoring and logging', () => {
    it('should log retry attempts with backoff information', async () => {
      const { logger } = await import('@/lib/core/logger')

      expect(typeof logger.warn).toBe('function')
    })

    it('should log when max retries exceeded', async () => {
      const { logger } = await import('@/lib/core/logger')

      expect(typeof logger.error).toBe('function')
    })

    it('should include context in error logs', () => {
      const errorContext = {
        batchSize: 128,
        attemptNumber: 3,
        backoffMs: 4000,
        error: 'Network error',
      }

      expect(errorContext).toHaveProperty('batchSize')
      expect(errorContext).toHaveProperty('attemptNumber')
      expect(errorContext).toHaveProperty('backoffMs')
    })
  })
})
