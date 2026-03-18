/**
 * Graph Populator Tests
 *
 * Verifies that entity extraction results are correctly translated
 * into knowledge graph nodes and edges.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { populateGraphFromExtraction } from './graph-populator'
import type { ExtractionResult } from './entity-extractor'

const mockClient = {
  upsertPerson: vi.fn().mockResolvedValue(undefined),
  upsertOrganization: vi.fn().mockResolvedValue(undefined),
  upsertTopic: vi.fn().mockResolvedValue(undefined),
  addMention: vi.fn().mockResolvedValue(undefined),
  addContact: vi.fn().mockResolvedValue(undefined),
  addDiscussed: vi.fn().mockResolvedValue(undefined),
}

vi.mock('./knowledge-graph', () => ({
  getKnowledgeGraph: vi.fn(() => mockClient),
}))

const mockGraph = mockClient

function createMockSupabase() {
  return {} as any
}

describe('populateGraphFromExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should skip when no mentions', async () => {
    const extraction: ExtractionResult = { mentions: [], entityCount: 0, processingTimeMs: 1 }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
    })

    expect(mockGraph.upsertPerson).not.toHaveBeenCalled()
    expect(mockGraph.upsertOrganization).not.toHaveBeenCalled()
  })

  it('should upsert person nodes from person mentions', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'person',
          value: 'Dr. John Smith',
          normalized: 'John Smith',
          position: { start: 0, end: 14 },
          confidence: 0.9,
          contactId: 'contact-123',
        },
      ],
      entityCount: 1,
      processingTimeMs: 5,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
    })

    expect(mockGraph.upsertPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'contact-123',
        name: 'John Smith',
        org_id: 'org-1',
      })
    )
  })

  it('should upsert organization nodes', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'organization',
          value: 'Example Corp',
          normalized: 'example corp',
          position: { start: 0, end: 12 },
          confidence: 0.7,
        },
      ],
      entityCount: 1,
      processingTimeMs: 3,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
    })

    expect(mockGraph.upsertOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ext:example corp',
        name: 'Example Corp',
      })
    )
  })

  it('should create topic from message subject', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'person',
          value: 'Jane',
          normalized: 'Jane',
          position: { start: 0, end: 4 },
          confidence: 0.6,
        },
      ],
      entityCount: 1,
      processingTimeMs: 2,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
      subject: 'Q4 Planning Meeting',
    })

    expect(mockGraph.upsertTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Q4 Planning Meeting',
        org_id: 'org-1',
      })
    )
  })

  it('should create MENTIONED_IN edges linking entities to topics', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'person',
          value: 'Alice',
          normalized: 'Alice',
          position: { start: 0, end: 5 },
          confidence: 0.8,
          contactId: 'contact-alice',
        },
      ],
      entityCount: 1,
      processingTimeMs: 3,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
      subject: 'Budget Review',
    })

    // Should create mention edge: alice → budget review topic
    expect(mockGraph.addMention).toHaveBeenCalled()
  })

  it('should create CONTACTED_BY edges from sender to mentioned people', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'person',
          value: 'Bob',
          normalized: 'Bob',
          position: { start: 0, end: 3 },
          confidence: 0.8,
          contactId: 'contact-bob',
        },
      ],
      entityCount: 1,
      processingTimeMs: 2,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
      senderId: 'user-tor',
      senderName: 'Tor',
    })

    // Should link sender (Tor) to mentioned person (Bob)
    expect(mockGraph.addContact).toHaveBeenCalledWith(
      'user-tor',
      'contact-bob',
      'email',
      1,
      expect.any(String)
    )
  })

  it('should handle email mentions with contact cross-reference', async () => {
    const extraction: ExtractionResult = {
      mentions: [
        {
          type: 'email',
          value: 'alice@example.com',
          normalized: 'alice@example.com',
          position: { start: 0, end: 17 },
          confidence: 0.95,
          contactId: 'contact-alice',
        },
      ],
      entityCount: 1,
      processingTimeMs: 1,
    }

    await populateGraphFromExtraction(extraction, 'org-1', createMockSupabase(), {
      messageId: 'msg-1',
      channel: 'email',
    })

    expect(mockGraph.upsertPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'contact-alice',
        email: 'alice@example.com',
      })
    )
  })
})
