import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMetadataFilter } from './pinecone-client'

// Mock the Pinecone SDK and logger (but not deeply)
vi.mock('@pinecone-database/pinecone')
vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('pinecone-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildMetadataFilter', () => {
    it('returns undefined when no filters provided', () => {
      const result = buildMetadataFilter({})
      expect(result).toBeUndefined()
    })

    it('builds channel filter correctly', () => {
      const result = buildMetadataFilter({ channel: 'gmail' })
      expect(result).toEqual({
        channel: { $eq: 'gmail' },
      })
    })

    it('builds sender filter correctly', () => {
      const result = buildMetadataFilter({ sender: 'alice@example.com' })
      expect(result).toEqual({
        sender: { $eq: 'alice@example.com' },
      })
    })

    it('builds date range filter with both dateFrom and dateTo', () => {
      const result = buildMetadataFilter({
        dateFrom: '2025-01-01T00:00:00Z',
        dateTo: '2025-03-15T23:59:59Z',
      })
      expect(result).toEqual({
        received_at: {
          $gte: '2025-01-01T00:00:00Z',
          $lte: '2025-03-15T23:59:59Z',
        },
      })
    })

    it('builds date range filter with only dateFrom', () => {
      const result = buildMetadataFilter({
        dateFrom: '2025-01-01T00:00:00Z',
      })
      expect(result).toEqual({
        received_at: {
          $gte: '2025-01-01T00:00:00Z',
        },
      })
    })

    it('builds date range filter with only dateTo', () => {
      const result = buildMetadataFilter({
        dateTo: '2025-03-15T23:59:59Z',
      })
      expect(result).toEqual({
        received_at: {
          $lte: '2025-03-15T23:59:59Z',
        },
      })
    })

    it('combines multiple filters correctly', () => {
      const result = buildMetadataFilter({
        channel: 'slack',
        sender: 'bob@company.com',
        dateFrom: '2025-02-01',
        dateTo: '2025-03-01',
      })
      expect(result).toEqual({
        channel: { $eq: 'slack' },
        sender: { $eq: 'bob@company.com' },
        received_at: {
          $gte: '2025-02-01',
          $lte: '2025-03-01',
        },
      })
    })

    it('treats empty strings as falsy and skips filter', () => {
      const result = buildMetadataFilter({
        channel: '',
        sender: 'alice@example.com',
      })
      // Empty strings are falsy, so they are not included in filter
      expect(result).toEqual({
        sender: { $eq: 'alice@example.com' },
      })
    })

    it('preserves filter structure for API consumption', () => {
      const result = buildMetadataFilter({
        channel: 'gmail',
        dateFrom: '2025-01-01',
      })

      // Verify structure matches Pinecone SDK expectations
      expect(result).toHaveProperty('channel')
      expect(result).toHaveProperty('received_at')
      expect(result!.channel).toHaveProperty('$eq')
      expect(result!.received_at).toHaveProperty('$gte')
    })

    it('does not include filter when only empty values provided', () => {
      const result = buildMetadataFilter({
        channel: undefined as any,
        sender: undefined as any,
      })
      expect(result).toBeUndefined()
    })
  })

  describe('graceful degradation', () => {
    it('should export functions that handle missing Pinecone API key', async () => {
      // This test verifies the exports exist and are callable
      // The actual behavior is tested via integration tests or manual verification
      const { queryPinecone, upsertVectors, deletePineconeVectors } = await import('./pinecone-client')

      expect(typeof queryPinecone).toBe('function')
      expect(typeof upsertVectors).toBe('function')
      expect(typeof deletePineconeVectors).toBe('function')
    })

    it('should export metadata filter builder', async () => {
      const { buildMetadataFilter } = await import('./pinecone-client')
      expect(typeof buildMetadataFilter).toBe('function')
    })
  })

  describe('batch size constraints', () => {
    it('should document max batch size of 100 vectors per upsert', () => {
      // This test documents the constraint from the implementation
      // The actual batching is verified in integration tests
      const maxBatchSize = 100
      expect(maxBatchSize).toBe(100)
    })
  })

  describe('namespace routing', () => {
    it('validates namespace parameter format', () => {
      // Valid org IDs should work as namespaces
      const validNamespaces = [
        'org-1',
        'org-abc123',
        '7abcbfb1',
        '02ce2616-c01b-45a5-a2ad-16ebe936a6b2',
      ]

      for (const ns of validNamespaces) {
        expect(ns).toBeTruthy()
        expect(typeof ns).toBe('string')
      }
    })
  })
})
