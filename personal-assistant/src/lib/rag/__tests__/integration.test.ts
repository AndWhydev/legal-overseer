/**
 * RAG Pipeline Integration Tests — Task #48
 *
 * Tests the full channel-sync → embed → search roundtrip:
 * 1. Create a VectorDocument with message content
 * 2. chunkText() to chunk it
 * 3. embedAndUpsert() with mocked Voyage (fake embeddings)
 * 4. Verify upsertVectors called with correct namespace + metadata
 * 5. searchVectors() with a query
 * 6. Verify queryPinecone called with correct filters
 * 7. Verify returned chunks have correct citation format
 * 8. Sandwich ranking applied
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks (must be declared before imports that depend on them) ──────────────

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../voyage-client', () => ({
  embedDocuments: vi.fn(),
  embedQuery: vi.fn(),
  rerankDocuments: vi.fn(),
}))

vi.mock('../pinecone-client', () => ({
  getIndex: vi.fn(),
  upsertVectors: vi.fn(),
  queryPinecone: vi.fn(),
  buildMetadataFilter: vi.fn(),
  deletePineconeVectorsByFilter: vi.fn(),
}))

vi.mock('../content-hasher', () => ({
  computeContentHash: vi.fn((text: string) => text.slice(0, 16).padEnd(16, '0')),
  checkExistingHashesBatch: vi.fn(async (_orgId: string, hashes: string[]) => {
    const map = new Map<string, boolean>()
    hashes.forEach(h => map.set(h, false)) // all new, no deduplication skips
    return map
  }),
}))

vi.mock('../sparse-encoder', () => ({
  encodeSparseVector: vi.fn(() => ({ indices: [1, 2, 3], values: [0.5, 0.3, 0.2] })),
  encodeQuerySparse: vi.fn(() => ({ indices: [1, 2, 3], values: [0.5, 0.3, 0.2] })),
}))

vi.mock('../entity-extractor', () => ({
  extractEntities: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../attachment-processor', () => ({
  processAttachment: vi.fn().mockResolvedValue(''),
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { embedAndUpsert } from '../embedding-service'
import { searchVectors } from '../retriever'
import { chunkText } from '../chunker'
import { embedDocuments, embedQuery, rerankDocuments } from '../voyage-client'
import { upsertVectors, queryPinecone } from '../pinecone-client'
import type { VectorDocument, PineconeMetadata } from '../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_EMBEDDING = Array.from({ length: 1024 }, (_, i) => (i % 10) * 0.1)

const makeGmailDoc = (overrides?: Partial<VectorDocument>): VectorDocument => ({
  messageId: 'gmail-msg-001',
  orgId: 'org-test-123',
  content: 'Hello, can we schedule a meeting for next Tuesday to discuss the Q2 roadmap?',
  metadata: {
    message_id: 'gmail-msg-001',
    org_id: 'org-test-123',
    channel: 'gmail',
    sender: 'alice@acme.com',
    sender_email: 'alice@acme.com',
    subject: 'Q2 Roadmap Meeting',
    received_at: '2026-03-10T09:00:00Z',
    chunk_index: 0,
    total_chunks: 1,
    is_full_body: true,
  },
  ...overrides,
})

const makeWhatsappDoc = (overrides?: Partial<VectorDocument>): VectorDocument => ({
  messageId: 'wa-msg-002',
  orgId: 'org-test-123',
  content: 'Hey! Just confirming dinner at 7pm tonight. See you there!',
  metadata: {
    message_id: 'wa-msg-002',
    org_id: 'org-test-123',
    channel: 'whatsapp',
    sender: 'Bob',
    received_at: '2026-03-10T11:30:00Z',
    chunk_index: 0,
    total_chunks: 1,
    is_full_body: true,
  },
  ...overrides,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePineconeMatch(
  id: string,
  score: number,
  metadata: Partial<PineconeMetadata> & { channel: string; sender: string; received_at: string }
) {
  return {
    id,
    score,
    metadata: {
      content: `Content for ${id}`,
      ...metadata,
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RAG Pipeline — channel sync → embed → search roundtrip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PINECONE_API_KEY = 'test-pinecone-key'
    process.env.VOYAGE_API_KEY = 'test-voyage-key'
  })

  afterEach(() => {
    delete process.env.PINECONE_API_KEY
    delete process.env.VOYAGE_API_KEY
  })

  // ── Write path: chunkText ─────────────────────────────────────────────────

  describe('chunkText — message chunking', () => {
    it('produces a single atomic chunk for a short gmail message', () => {
      const doc = makeGmailDoc()
      const chunks = chunkText(doc.content, doc.metadata)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].chunkId).toBe('gmail-msg-001#chunk0')
      expect(chunks[0].metadata.chunk_index).toBe(0)
      expect(chunks[0].metadata.total_chunks).toBe(1)
      // Metadata prepend must include channel info
      expect(chunks[0].text).toContain('Channel: gmail')
      expect(chunks[0].text).toContain('From: alice@acme.com')
      expect(chunks[0].text).toContain('Subject: Q2 Roadmap Meeting')
    })

    it('produces a single atomic chunk for a short whatsapp message', () => {
      const doc = makeWhatsappDoc()
      const chunks = chunkText(doc.content, doc.metadata)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].chunkId).toBe('wa-msg-002#chunk0')
      expect(chunks[0].metadata.channel).toBe('whatsapp')
      expect(chunks[0].text).toContain('Channel: whatsapp')
    })

    it('produces multiple chunks with correct IDs for a long message', () => {
      const longContent = Array(300)
        .fill(0)
        .map((_, i) => `Paragraph ${i}: Detailed discussion about Q2 roadmap features and deliverables.`)
        .join('\n\n')

      const doc = makeGmailDoc({ content: longContent })
      const chunks = chunkText(longContent, doc.metadata)

      expect(chunks.length).toBeGreaterThan(1)
      chunks.forEach((chunk, i) => {
        expect(chunk.chunkId).toBe(`gmail-msg-001#chunk${i}`)
        expect(chunk.metadata.chunk_index).toBe(i)
        expect(chunk.metadata.total_chunks).toBe(chunks.length)
      })
    })
  })

  // ── Write path: embedAndUpsert ────────────────────────────────────────────

  describe('embedAndUpsert — gmail message', () => {
    it('calls embedDocuments with chunked text', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeGmailDoc()
      await embedAndUpsert([doc])

      expect(embedDocuments).toHaveBeenCalledOnce()
      const texts: string[] = vi.mocked(embedDocuments).mock.calls[0][0]
      expect(texts).toHaveLength(1)
      expect(texts[0]).toContain('Channel: gmail')
      expect(texts[0]).toContain('Q2 Roadmap Meeting')
    })

    it('calls upsertVectors with correct namespace (orgId)', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeGmailDoc()
      const result = await embedAndUpsert([doc])

      expect(upsertVectors).toHaveBeenCalledOnce()
      const [vectors, namespace] = vi.mocked(upsertVectors).mock.calls[0]
      expect(namespace).toBe('org-test-123')
      expect(vectors).toHaveLength(1)
      expect(vectors[0].id).toBe('gmail-msg-001#chunk0')
      expect(result.embedded).toBe(1)
      expect(result.failed).toBe(0)
    })

    it('stores content in vector metadata for later retrieval', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeGmailDoc()
      await embedAndUpsert([doc])

      const [vectors] = vi.mocked(upsertVectors).mock.calls[0]
      expect(vectors[0].metadata.content).toBeDefined()
      expect(typeof vectors[0].metadata.content).toBe('string')
      expect(vectors[0].metadata.content).toContain('Q2 Roadmap Meeting')
    })

    it('stores channel, sender, and received_at in vector metadata', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeGmailDoc()
      await embedAndUpsert([doc])

      const [vectors] = vi.mocked(upsertVectors).mock.calls[0]
      const meta = vectors[0].metadata
      expect(meta.channel).toBe('gmail')
      expect(meta.sender).toBe('alice@acme.com')
      expect(meta.received_at).toBe('2026-03-10T09:00:00Z')
      expect(meta.org_id).toBe('org-test-123')
    })

    it('includes sparse vector for hybrid search', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeGmailDoc()
      await embedAndUpsert([doc])

      const [vectors] = vi.mocked(upsertVectors).mock.calls[0]
      expect(vectors[0].sparseValues).toBeDefined()
      expect(vectors[0].sparseValues!.indices).toEqual([1, 2, 3])
    })
  })

  // ── Write path: whatsapp channel ──────────────────────────────────────────

  describe('embedAndUpsert — whatsapp message', () => {
    it('namespaces to same orgId but different channel metadata', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const doc = makeWhatsappDoc()
      await embedAndUpsert([doc])

      const [vectors, namespace] = vi.mocked(upsertVectors).mock.calls[0]
      expect(namespace).toBe('org-test-123')
      expect(vectors[0].metadata.channel).toBe('whatsapp')
      expect(vectors[0].metadata.sender).toBe('Bob')
    })
  })

  // ── Write path: multiple channels ─────────────────────────────────────────

  describe('embedAndUpsert — multiple channels, same org', () => {
    it('upserts both docs in a single call (same org namespace)', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING, FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 2, failed: 0, errors: [] })

      const gmailDoc = makeGmailDoc()
      const waDoc = makeWhatsappDoc()
      const result = await embedAndUpsert([gmailDoc, waDoc])

      // Same orgId → single upsert call
      expect(upsertVectors).toHaveBeenCalledOnce()
      const [vectors, namespace] = vi.mocked(upsertVectors).mock.calls[0]
      expect(namespace).toBe('org-test-123')
      expect(vectors).toHaveLength(2)
      expect(result.embedded).toBe(2)

      const channels = vectors.map(v => v.metadata.channel)
      expect(channels).toContain('gmail')
      expect(channels).toContain('whatsapp')
    })

    it('splits upserts across different org namespaces', async () => {
      vi.mocked(embedDocuments).mockResolvedValue([FAKE_EMBEDDING, FAKE_EMBEDDING])
      vi.mocked(upsertVectors).mockResolvedValue({ upserted: 1, failed: 0, errors: [] })

      const org1Doc = makeGmailDoc({
        orgId: 'org-111',
        metadata: {
          message_id: 'gmail-msg-001',
          org_id: 'org-111',
          channel: 'gmail',
          sender: 'alice@acme.com',
          sender_email: 'alice@acme.com',
          subject: 'Q2 Roadmap Meeting',
          received_at: '2026-03-10T09:00:00Z',
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
        },
      })
      const org2Doc = makeWhatsappDoc({
        orgId: 'org-222',
        metadata: {
          message_id: 'wa-msg-002',
          org_id: 'org-222',
          channel: 'whatsapp',
          sender: 'Bob',
          received_at: '2026-03-10T11:30:00Z',
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
        },
      })

      await embedAndUpsert([org1Doc, org2Doc])

      expect(upsertVectors).toHaveBeenCalledTimes(2)
      const namespaces = vi.mocked(upsertVectors).mock.calls.map(([, ns]) => ns)
      expect(namespaces).toContain('org-111')
      expect(namespaces).toContain('org-222')
    })
  })

  // ── Read path: searchVectors ──────────────────────────────────────────────

  describe('searchVectors — query and retrieval', () => {
    it('embeds the query then calls queryPinecone with orgId as namespace', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({ query: 'Q2 roadmap meeting', orgId: 'org-test-123' })

      expect(embedQuery).toHaveBeenCalledWith('Q2 roadmap meeting')
      expect(queryPinecone).toHaveBeenCalledWith(
        FAKE_EMBEDDING,
        'org-test-123',
        expect.any(Object)
      )
    })

    it('passes channel filter to Pinecone', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({ query: 'meeting', orgId: 'org-test-123', channel: 'gmail' })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        'org-test-123',
        expect.objectContaining({ channel: 'gmail' })
      )
    })

    it('passes sender filter to Pinecone', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({ query: 'alice email', orgId: 'org-test-123', sender: 'alice@acme.com' })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        'org-test-123',
        expect.objectContaining({ sender: 'alice@acme.com' })
      )
    })

    it('passes date range filters to Pinecone', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'recent messages',
        orgId: 'org-test-123',
        dateFrom: '2026-03-01T00:00:00Z',
        dateTo: '2026-03-15T23:59:59Z',
      })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        'org-test-123',
        expect.objectContaining({
          dateFrom: '2026-03-01T00:00:00Z',
          dateTo: '2026-03-15T23:59:59Z',
        })
      )
    })

    it('over-fetches 3x for reranking (topK=10 → requests 30)', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({ query: 'test', orgId: 'org-test-123', topK: 10 })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ topK: 30 })
      )
    })

    it('returns chunks with [channel|sender|date] citation format', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([
        makePineconeMatch('gmail-msg-001#chunk0', 0.92, {
          channel: 'gmail',
          sender: 'alice@acme.com',
          received_at: '2026-03-10T09:00:00Z',
          message_id: 'gmail-msg-001',
          org_id: 'org-test-123',
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
        }),
      ])

      const results = await searchVectors({ query: 'Q2 meeting', orgId: 'org-test-123' })

      expect(results).toHaveLength(1)
      // Citation format: [channel|sender|date]
      expect(results[0].citationRef).toMatch(/\[gmail\|alice@acme\.com\|.*\]/)
    })

    it('returns content from Pinecone metadata for each chunk', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([
        {
          id: 'gmail-msg-001#chunk0',
          score: 0.88,
          metadata: {
            channel: 'gmail',
            sender: 'alice@acme.com',
            received_at: '2026-03-10T09:00:00Z',
            content: 'Channel: gmail | From: alice@acme.com\n\nHello, can we schedule a meeting?',
          },
        },
      ])

      const results = await searchVectors({ query: 'meeting schedule', orgId: 'org-test-123' })

      expect(results[0].content).toContain('meeting')
      expect(results[0].content).toContain('alice@acme.com')
    })
  })

  // ── Read path: metadata filters ───────────────────────────────────────────

  describe('searchVectors — metadata filter combinations', () => {
    it('applies channel=whatsapp filter', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([
        makePineconeMatch('wa-msg-002#chunk0', 0.85, {
          channel: 'whatsapp',
          sender: 'Bob',
          received_at: '2026-03-10T11:30:00Z',
          message_id: 'wa-msg-002',
          org_id: 'org-test-123',
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
        }),
      ])

      const results = await searchVectors({
        query: 'dinner tonight',
        orgId: 'org-test-123',
        channel: 'whatsapp',
      })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ channel: 'whatsapp' })
      )
      expect(results[0].metadata.channel).toBe('whatsapp')
    })

    it('applies combined channel + sender + date range filters', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      await searchVectors({
        query: 'important message',
        orgId: 'org-test-123',
        channel: 'gmail',
        sender: 'alice@acme.com',
        dateFrom: '2026-03-01T00:00:00Z',
        dateTo: '2026-03-15T23:59:59Z',
      })

      expect(queryPinecone).toHaveBeenCalledWith(
        expect.anything(),
        'org-test-123',
        expect.objectContaining({
          channel: 'gmail',
          sender: 'alice@acme.com',
          dateFrom: '2026-03-01T00:00:00Z',
          dateTo: '2026-03-15T23:59:59Z',
        })
      )
    })
  })

  // ── Sandwich ranking ──────────────────────────────────────────────────────

  describe('searchVectors — sandwich ranking', () => {
    it('applies sandwich ranking: highest score first in returned chunks', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(rerankDocuments).mockResolvedValue([]) // skip reranking

      // Return 6 results in unsorted order
      const mockResults = [
        makePineconeMatch('msg-3', 0.72, { channel: 'gmail', sender: 'carol@acme.com', received_at: '2026-03-10T10:00:00Z', message_id: 'msg-3', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
        makePineconeMatch('msg-1', 0.95, { channel: 'gmail', sender: 'alice@acme.com', received_at: '2026-03-10T09:00:00Z', message_id: 'msg-1', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
        makePineconeMatch('msg-5', 0.58, { channel: 'slack', sender: 'eve@acme.com', received_at: '2026-03-10T12:00:00Z', message_id: 'msg-5', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
        makePineconeMatch('msg-2', 0.87, { channel: 'whatsapp', sender: 'bob@acme.com', received_at: '2026-03-10T10:30:00Z', message_id: 'msg-2', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
        makePineconeMatch('msg-4', 0.65, { channel: 'outlook', sender: 'dave@acme.com', received_at: '2026-03-10T11:00:00Z', message_id: 'msg-4', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
        makePineconeMatch('msg-6', 0.45, { channel: 'sms', sender: 'frank@acme.com', received_at: '2026-03-10T13:00:00Z', message_id: 'msg-6', org_id: 'org-test-123', chunk_index: 0, total_chunks: 1, is_full_body: true }),
      ]

      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'acme update',
        orgId: 'org-test-123',
        topK: 6,
      })

      expect(results).toHaveLength(6)
      // Highest score should be first (sandwich puts best at front edge)
      expect(results[0].score).toBe(0.95)
    })

    it('returns results trimmed to topK after sandwich ranking', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(rerankDocuments).mockResolvedValue([])

      const mockResults = Array.from({ length: 15 }, (_, i) =>
        makePineconeMatch(`msg-${i}`, 0.9 - i * 0.03, {
          channel: 'gmail',
          sender: `user${i}@acme.com`,
          received_at: '2026-03-10T09:00:00Z',
          message_id: `msg-${i}`,
          org_id: 'org-test-123',
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
        })
      )

      vi.mocked(queryPinecone).mockResolvedValue(mockResults as any)

      const results = await searchVectors({
        query: 'emails from users',
        orgId: 'org-test-123',
        topK: 5,
      })

      expect(results).toHaveLength(5)
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns all-failed result when env vars are missing', async () => {
      delete process.env.PINECONE_API_KEY

      const doc = makeGmailDoc()
      const result = await embedAndUpsert([doc])

      expect(result.failed).toBe(1)
      expect(result.embedded).toBe(0)
      expect(result.errors[0]).toContain('PINECONE_API_KEY')
    })

    it('returns empty array when query embedding fails', async () => {
      vi.mocked(embedQuery).mockResolvedValue(null)

      const results = await searchVectors({ query: 'test', orgId: 'org-test-123' })

      expect(results).toEqual([])
      expect(queryPinecone).not.toHaveBeenCalled()
    })

    it('returns empty array when Pinecone returns no matches', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([])

      const results = await searchVectors({ query: 'no results', orgId: 'org-test-123' })

      expect(results).toEqual([])
    })

    it('returns empty string content when metadata.content is missing', async () => {
      vi.mocked(embedQuery).mockResolvedValue(FAKE_EMBEDDING)
      vi.mocked(queryPinecone).mockResolvedValue([
        {
          id: 'msg-orphan#chunk0',
          score: 0.75,
          metadata: {
            channel: 'gmail',
            sender: 'ghost@acme.com',
            received_at: '2026-03-10T09:00:00Z',
            // intentionally missing `content`
          },
        },
      ])

      const results = await searchVectors({ query: 'orphan', orgId: 'org-test-123' })

      expect(results[0].content).toBe('')
    })
  })
})
