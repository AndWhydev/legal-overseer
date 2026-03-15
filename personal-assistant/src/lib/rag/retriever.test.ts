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

import { embedQuery } from './voyage-client'
import { queryPinecone } from './pinecone-client'

describe('retriever functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })
})
