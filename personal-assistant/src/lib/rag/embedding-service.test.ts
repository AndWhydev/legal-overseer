import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embedAndUpsert } from './embedding-service'
import type { VectorDocument } from './types'

// Mock the dependencies
vi.mock('./chunker', () => ({
  chunkText: vi.fn(),
}))

vi.mock('./voyage-client', () => ({
  embedDocuments: vi.fn(),
}))

vi.mock('./pinecone-client', () => ({
  upsertVectors: vi.fn(),
  deletePineconeVectorsByFilter: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { chunkText } from './chunker'
import { embedDocuments } from './voyage-client'
import { upsertVectors } from './pinecone-client'

describe('embedAndUpsert', () => {
  const mockVectorDocument: VectorDocument = {
    messageId: 'msg-123',
    orgId: 'org-abc',
    content: 'Test message content.',
    metadata: {
      message_id: 'msg-123',
      org_id: 'org-abc',
      channel: 'gmail',
      sender: 'alice@example.com',
      subject: 'Test',
      received_at: '2025-03-15T10:00:00Z',
      chunk_index: 0,
      total_chunks: 1,
      is_full_body: true,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Setup default env vars
    process.env.PINECONE_API_KEY = 'test-pinecone-key'
    process.env.VOYAGE_API_KEY = 'test-voyage-key'
  })

  it('returns early with all failed when PINECONE_API_KEY missing', async () => {
    delete process.env.PINECONE_API_KEY

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('PINECONE_API_KEY')
  })

  it('returns early with all failed when VOYAGE_API_KEY missing', async () => {
    delete process.env.VOYAGE_API_KEY

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('VOYAGE_API_KEY')
  })

  it('calls chunkText for each document', async () => {
    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'Chunked content.',
        metadata: mockVectorDocument.metadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue([[0.1, 0.2, 0.3]])
    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 1,
      failed: 0,
      errors: [],
    })

    await embedAndUpsert([mockVectorDocument])

    expect(chunkText).toHaveBeenCalledWith(
      mockVectorDocument.content,
      mockVectorDocument.metadata
    )
  })

  it('returns all failed when embedDocuments returns null', async () => {
    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'Chunked content.',
        metadata: mockVectorDocument.metadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue(null)

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('All embeddings failed')
  })

  it('handles empty embeddings array gracefully', async () => {
    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'Chunked content.',
        metadata: mockVectorDocument.metadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue([])

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('groups vectors by org_id for upsert', async () => {
    const doc1 = {
      ...mockVectorDocument,
      metadata: { ...mockVectorDocument.metadata, org_id: 'org-1' },
    }

    const doc2 = {
      ...mockVectorDocument,
      messageId: 'msg-456',
      metadata: { ...mockVectorDocument.metadata, message_id: 'msg-456', org_id: 'org-2' },
    }

    vi.mocked(chunkText)
      .mockReturnValueOnce([
        { text: 'Doc 1 chunk.', metadata: doc1.metadata, chunkId: 'msg-123#chunk0' },
      ])
      .mockReturnValueOnce([
        { text: 'Doc 2 chunk.', metadata: doc2.metadata, chunkId: 'msg-456#chunk0' },
      ])

    vi.mocked(embedDocuments).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ])

    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 1,
      failed: 0,
      errors: [],
    })

    await embedAndUpsert([doc1, doc2])

    // upsertVectors should be called twice (once per org)
    expect(upsertVectors).toHaveBeenCalledTimes(2)

    // First call for org-1, second for org-2
    const calls = vi.mocked(upsertVectors).mock.calls
    expect(calls[0][1]).toBe('org-1')
    expect(calls[1][1]).toBe('org-2')
  })

  it('accumulates results from multiple orgs', async () => {
    const doc1 = {
      ...mockVectorDocument,
      metadata: { ...mockVectorDocument.metadata, org_id: 'org-1' },
    }

    const doc2 = {
      ...mockVectorDocument,
      messageId: 'msg-456',
      metadata: { ...mockVectorDocument.metadata, message_id: 'msg-456', org_id: 'org-2' },
    }

    vi.mocked(chunkText)
      .mockReturnValueOnce([
        { text: 'Doc 1 chunk.', metadata: doc1.metadata, chunkId: 'msg-123#chunk0' },
      ])
      .mockReturnValueOnce([
        { text: 'Doc 2 chunk.', metadata: doc2.metadata, chunkId: 'msg-456#chunk0' },
      ])

    vi.mocked(embedDocuments).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ])

    vi.mocked(upsertVectors)
      .mockResolvedValueOnce({ upserted: 1, failed: 0, errors: [] })
      .mockResolvedValueOnce({ upserted: 1, failed: 0, errors: [] })

    const result = await embedAndUpsert([doc1, doc2])

    expect(result.embedded).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('accumulates errors from failed upserts', async () => {
    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'Chunked content.',
        metadata: mockVectorDocument.metadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue([[0.1, 0.2, 0.3]])

    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 0,
      failed: 1,
      errors: ['Batch 1: Connection timeout'],
    })

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
    expect(result.errors).toContain('Batch 1: Connection timeout')
  })

  it('returns empty result for empty documents array', async () => {
    const result = await embedAndUpsert([])

    expect(result.embedded).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(chunkText).not.toHaveBeenCalled()
  })

  it('stores content in metadata for retrieval', async () => {
    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'From: alice@example.com\n\nChunked content.',
        metadata: mockVectorDocument.metadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue([[0.1, 0.2, 0.3]])

    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 1,
      failed: 0,
      errors: [],
    })

    await embedAndUpsert([mockVectorDocument])

    const upsertCall = vi.mocked(upsertVectors).mock.calls[0]
    const vectors = upsertCall[0]

    expect(vectors[0].metadata.content).toBe('From: alice@example.com\n\nChunked content.')
  })

  it('includes chunk metadata in upserted vectors', async () => {
    const customMetadata = {
      ...mockVectorDocument.metadata,
      chunk_index: 0,
      total_chunks: 1,
    }

    vi.mocked(chunkText).mockReturnValue([
      {
        text: 'Chunked content.',
        metadata: customMetadata,
        chunkId: 'msg-123#chunk0',
      },
    ])

    vi.mocked(embedDocuments).mockResolvedValue([[0.1, 0.2, 0.3]])

    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 1,
      failed: 0,
      errors: [],
    })

    await embedAndUpsert([mockVectorDocument])

    const upsertCall = vi.mocked(upsertVectors).mock.calls[0]
    const vectors = upsertCall[0]

    expect(vectors[0].metadata.chunk_index).toBe(0)
    expect(vectors[0].metadata.total_chunks).toBe(1)
    expect(vectors[0].metadata.message_id).toBe('msg-123')
  })

  it('handles null embeddings for specific documents gracefully', async () => {
    const chunk = {
      text: 'Chunked content.',
      metadata: mockVectorDocument.metadata,
      chunkId: 'msg-123#chunk0',
    }

    vi.mocked(chunkText).mockReturnValue([chunk])

    // Simulate partial embedding failure
    vi.mocked(embedDocuments).mockResolvedValue(null)

    const result = await embedAndUpsert([mockVectorDocument])

    // All should fail if embedDocuments returns null
    expect(result.failed).toBe(1)
    expect(result.embedded).toBe(0)
  })

  it('batches multiple chunks from same document together', async () => {
    const chunks = [
      { text: 'Chunk 1.', metadata: mockVectorDocument.metadata, chunkId: 'msg-123#chunk0' },
      { text: 'Chunk 2.', metadata: { ...mockVectorDocument.metadata, chunk_index: 1, total_chunks: 2 }, chunkId: 'msg-123#chunk1' },
    ]

    vi.mocked(chunkText).mockReturnValue(chunks)

    vi.mocked(embedDocuments).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ])

    vi.mocked(upsertVectors).mockResolvedValue({
      upserted: 2,
      failed: 0,
      errors: [],
    })

    const result = await embedAndUpsert([mockVectorDocument])

    expect(result.embedded).toBe(2)
    expect(vi.mocked(embedDocuments).mock.calls[0][0]).toHaveLength(2)
  })
})
