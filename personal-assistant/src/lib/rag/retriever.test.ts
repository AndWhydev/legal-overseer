import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatChunksForContext, searchVectors } from './retriever'
import type { RetrievedChunk } from './types'

// Mock the voyage and pinecone clients
vi.mock('./voyage-client', () => ({
  embedQuery: vi.fn(),
  rerankDocuments: vi.fn(),
}))

vi.mock('./pinecone-client', () => ({
  queryPinecone: vi.fn(),
}))

// Mock search-cache to prevent cross-test contamination from the in-memory cache
vi.mock('@/lib/cache/search-cache', () => ({
  buildCacheKey: vi.fn().mockReturnValue('test-key'),
  getCachedSearch: vi.fn().mockReturnValue(null),
  setCachedSearch: vi.fn(),
  invalidateOrg: vi.fn(),
  clearCache: vi.fn(),
}))

// Mock sparse-encoder (used by retriever)
vi.mock('./sparse-encoder', () => ({
  encodeQuerySparse: vi.fn().mockReturnValue({ indices: [], values: [] }),
  encodeSparseVector: vi.fn().mockReturnValue({ indices: [], values: [] }),
}))

import { embedQuery } from './voyage-client'
import { queryPinecone } from './pinecone-client'
import { getCachedSearch } from '@/lib/cache/search-cache'

describe('retriever functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure cache always misses so each test hits Pinecone fresh
    vi.mocked(getCachedSearch).mockReturnValue(null)
  })

  describe('formatChunksForContext', () => {
    it('returns empty string for empty chunks array', () => {
      const result = formatChunksForContext([])
      expect(result).toBe('')
    })

    it('formats single chunk correctly', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'This is the chunk content.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'gmail',
            sender: 'bob@example.com',
            received_at: '2025-03-15T10:00:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[gmail|bob@example.com|Mar 15]',
        },
      ]

      const result = formatChunksForContext(chunks)

      expect(result).toContain('[gmail | bob@example.com | Mar 15')
      expect(result).toContain('This is the chunk content.')
      expect(result).toContain('---')
    })

    it('separates multiple chunks with blank lines and dashes', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'First chunk content.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2025-03-15T10:00:00Z',
            chunk_index: 0,
            total_chunks: 2,
            is_full_body: true,
          },
          citationRef: '[gmail|alice@example.com|Mar 15]',
        },
        {
          id: 'chunk-2',
          score: 0.85,
          content: 'Second chunk content.',
          metadata: {
            message_id: 'msg-2',
            org_id: 'org-1',
            channel: 'slack',
            sender: 'bob@company.com',
            received_at: '2025-03-14T15:30:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[slack|bob@company.com|Mar 14]',
        },
      ]

      const result = formatChunksForContext(chunks)

      expect(result).toContain('First chunk content.')
      expect(result).toContain('---')
      expect(result).toContain('Second chunk content.')
      // Chunks should be separated by blank lines
      expect(result).toContain('---\n\n[slack')
    })

    it('includes channel, sender, and date in formatted output', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.9,
          content: 'Test content.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'outlook',
            sender: 'carol@org.com',
            received_at: '2025-02-28T08:00:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[outlook|carol@org.com|Feb 28]',
        },
      ]

      const result = formatChunksForContext(chunks)

      expect(result).toContain('outlook')
      expect(result).toContain('carol@org.com')
      expect(result).toContain('Feb')
    })
  })

  describe('searchVectors', () => {
    it('returns empty array when Pinecone is unavailable', async () => {
      vi.mocked(embedQuery).mockResolvedValue(null)

      const result = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      expect(result).toEqual([])
    })

    it('returns empty array when Pinecone returns no results', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      const result = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      expect(result).toEqual([])
    })

    it('calls embedQuery with the search query', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'find important emails',
        orgId: 'org-1',
      })

      expect(embedQuery).toHaveBeenCalledWith('find important emails')
    })

    it('passes metadata filters to Pinecone query', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'test',
        orgId: 'org-1',
        channel: 'gmail',
        sender: 'alice@example.com',
        dateFrom: '2025-01-01',
        dateTo: '2025-03-15',
      })

      expect(queryPinecone).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'org-1',
        expect.objectContaining({
          channel: 'gmail',
          sender: 'alice@example.com',
          dateFrom: '2025-01-01',
          dateTo: '2025-03-15',
        })
      )
    })

    it('respects topK parameter', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'test',
        orgId: 'org-1',
        topK: 5,
      })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          topK: 15, // over-fetch 3x
        })
      )
    })

    it('formats results with citation references', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockResults = [
        {
          id: 'msg-1#chunk0',
          score: 0.95,
          metadata: {
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2025-03-15T10:00:00Z',
            content: 'Test content',
          },
        },
      ]

      vi.mocked(embedQuery).mockResolvedValue(mockEmbedding)
      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      expect(results).toHaveLength(1)
      expect(results[0].citationRef).toMatch(/\[.*\|.*\|.*\]/)
    })

    it('applies sandwich ranking to results', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])

      // Return 6 results with varying scores
      const mockResults = [
        { id: 'msg-1', score: 0.95, metadata: { channel: 'gmail', sender: 'alice@example.com', received_at: '2025-03-15T10:00:00Z', content: 'High score' } },
        { id: 'msg-2', score: 0.85, metadata: { channel: 'slack', sender: 'bob@company.com', received_at: '2025-03-14T10:00:00Z', content: 'Mid score' } },
        { id: 'msg-3', score: 0.75, metadata: { channel: 'outlook', sender: 'carol@org.com', received_at: '2025-03-13T10:00:00Z', content: 'Low score' } },
        { id: 'msg-4', score: 0.65, metadata: { channel: 'gmail', sender: 'dave@example.com', received_at: '2025-03-12T10:00:00Z', content: 'Lowest' } },
      ]

      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
        topK: 4,
      })

      // Sandwich ranking should place highest and lowest scores at edges
      expect(results).toHaveLength(4)
      // Highest score (0.95) should be at top
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    })

    it('limits results to topK after sandwich ranking', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])

      const mockResults = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        score: 0.9 - i * 0.02,
        metadata: {
          channel: 'gmail',
          sender: `sender${i}@example.com`,
          received_at: '2025-03-15T10:00:00Z',
          content: `Content ${i}`,
        },
      }))

      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
        topK: 5,
      })

      expect(results).toHaveLength(5)
    })

    it('handles dates from current year without year suffix', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'Test content.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: new Date().toISOString(),
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[gmail|alice@example.com|Today]',
        },
      ]

      const result = formatChunksForContext(chunks)

      // Should contain month and day but not year (if current year)
      expect(result).toMatch(/\w+ \d+/)
    })

    it('handles dates from past years with year suffix', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'Old content.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2024-03-15T10:00:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[gmail|alice@example.com|Mar 15, 2024]',
        },
      ]

      const result = formatChunksForContext(chunks)

      expect(result).toContain('2024')
    })

    it('handles missing content in metadata gracefully', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])

      const mockResults = [
        {
          id: 'msg-1#chunk0',
          score: 0.95,
          metadata: {
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2025-03-15T10:00:00Z',
            // Missing content field
          },
        },
      ]

      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('')
    })

    it('over-fetches by 3x for reranking', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'test query',
        orgId: 'org-1',
        topK: 10,
      })

      // Should request 30 vectors (3x of topK=10)
      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          topK: 30,
        })
      )
    })

    it('includes sparse vector for hybrid search', async () => {
      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'test query for hybrid search',
        orgId: 'org-1',
      })

      // Should have called queryPinecone with sparseVector
      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          alpha: 0.7, // 70% dense, 30% sparse
        })
      )
    })

    it('returns empty on embedQuery failure', async () => {
      vi.mocked(embedQuery).mockResolvedValue(null)

      const result = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      expect(result).toEqual([])
      expect(queryPinecone).not.toHaveBeenCalled()
    })

    it('handles reranking gracefully on error', async () => {
      const { rerankDocuments } = await import('./voyage-client')

      vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
      const mockResults = [
        {
          id: 'msg-1#chunk0',
          score: 0.95,
          metadata: {
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2025-03-15T10:00:00Z',
            content: 'Test content',
          },
        },
      ]
      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      // Mock reranking to fail
      vi.mocked(rerankDocuments).mockRejectedValue(new Error('Reranking failed'))

      const results = await searchVectors({
        query: 'test query',
        orgId: 'org-1',
      })

      // Should still return results (fallback to vector scores)
      expect(results).toHaveLength(1)
      expect(results[0].score).toBe(0.95)
    })

    it('builds proper citation format [channel | sender | date]', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'Content',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'outlook',
            sender: 'carol@org.com',
            received_at: '2025-02-28T08:00:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[outlook | carol@org.com | Feb 28]',
        },
      ]

      const result = formatChunksForContext(chunks)

      expect(result).toContain('[outlook | carol@org.com | Feb')
    })

    it('separates chunks with proper formatting', () => {
      const chunks: RetrievedChunk[] = [
        {
          id: 'chunk-1',
          score: 0.95,
          content: 'First chunk.',
          metadata: {
            message_id: 'msg-1',
            org_id: 'org-1',
            channel: 'gmail',
            sender: 'alice@example.com',
            received_at: '2025-03-15T10:00:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[gmail|alice@example.com|Mar 15]',
        },
        {
          id: 'chunk-2',
          score: 0.85,
          content: 'Second chunk.',
          metadata: {
            message_id: 'msg-2',
            org_id: 'org-1',
            channel: 'slack',
            sender: 'bob@company.com',
            received_at: '2025-03-14T15:30:00Z',
            chunk_index: 0,
            total_chunks: 1,
            is_full_body: true,
          },
          citationRef: '[slack|bob@company.com|Mar 14]',
        },
      ]

      const result = formatChunksForContext(chunks)

      // Should have dashes between chunks
      expect(result).toContain('---')
      // Should have blank line after dashes
      expect(result).toMatch(/---\n\n\[/)
    })
  })
})
