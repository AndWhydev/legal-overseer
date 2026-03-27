/**
 * Knowledge Graph Client Tests
 *
 * Tests for Supabase-backed KnowledgeGraphClient.
 * Uses mocked Supabase client to verify query patterns.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  KnowledgeGraphClient,
  getKnowledgeGraph,
  closeKnowledgeGraph,
} from './knowledge-graph'
import type { PersonNode, OrganizationNode, TopicNode } from './knowledge-graph'

// ─── Mock Supabase ────────────────────────────────────────────────────────

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn(() => mockChain),
    _chain: mockChain,
  }
}

describe('KnowledgeGraphClient', () => {
  let client: KnowledgeGraphClient
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    client = new KnowledgeGraphClient(mockSupabase as any, 'org-1')
  })

  describe('initialization', () => {
    it('should be immediately initialized', () => {
      expect(client.isInitialized()).toBe(true)
    })

    it('should init without error', async () => {
      await expect(client.init()).resolves.toBeUndefined()
    })
  })

  describe('entity operations', () => {
    it('should upsert a person node', async () => {
      const person: PersonNode = {
        id: 'person-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        org_id: 'org-1',
        created_at: new Date().toISOString(),
      }

      await client.upsertPerson(person)

      expect(mockSupabase.from).toHaveBeenCalledWith('kg_nodes')
      expect(mockSupabase._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          node_type: 'Person',
          entity_id: 'person-1',
          name: 'John Doe',
        }),
        { onConflict: 'org_id,entity_id' }
      )
    })

    it('should upsert an organization node', async () => {
      const org: OrganizationNode = {
        id: 'org-ext-1',
        name: 'Example Corp',
        domain: 'example.com',
        org_id: 'org-1',
        created_at: new Date().toISOString(),
      }

      await client.upsertOrganization(org)

      expect(mockSupabase._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          node_type: 'Organization',
          entity_id: 'org-ext-1',
          name: 'Example Corp',
        }),
        expect.any(Object)
      )
    })

    it('should upsert a topic node', async () => {
      const topic: TopicNode = {
        id: 'topic-1',
        name: 'Q4 Planning',
        org_id: 'org-1',
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      }

      await client.upsertTopic(topic)

      expect(mockSupabase._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          node_type: 'Topic',
          entity_id: 'topic-1',
          name: 'Q4 Planning',
        }),
        expect.any(Object)
      )
    })
  })

  describe('edge operations', () => {
    it('should create a mention edge (new)', async () => {
      // maybeSingle returns null → insert path
      mockSupabase._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      await client.addMention('person-1', 'topic-1', 'msg-1', 'email', new Date().toISOString())

      expect(mockSupabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          source_id: 'person-1',
          target_id: 'topic-1',
          edge_type: 'MENTIONED_IN',
        })
      )
    })

    it('should update existing mention edge', async () => {
      mockSupabase._chain.maybeSingle.mockResolvedValueOnce({
        data: { id: 'edge-1', metadata: { message_ids: ['msg-0'] } },
        error: null,
      })

      await client.addMention('person-1', 'topic-1', 'msg-1', 'email', new Date().toISOString())

      expect(mockSupabase._chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            message_ids: ['msg-0', 'msg-1'],
          }),
        })
      )
    })

    it('should create a contact edge', async () => {
      mockSupabase._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      await client.addContact('person-1', 'person-2', 'email', 5)

      expect(mockSupabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          source_id: 'person-1',
          target_id: 'person-2',
          edge_type: 'CONTACTED_BY',
          metadata: expect.objectContaining({ message_count: 5 }),
        })
      )
    })

    it('should create a discussed edge', async () => {
      mockSupabase._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      await client.addDiscussed('topic-1', 'topic-2')

      expect(mockSupabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          source_id: 'topic-1',
          target_id: 'topic-2',
          edge_type: 'DISCUSSED',
        })
      )
    })
  })

  describe('graph traversal', () => {
    it('should return empty relationships when no edges', async () => {
      // loadEdges returns empty
      mockSupabase._chain.limit.mockResolvedValue({ data: [], error: null })

      const results = await client.getRelationships('person-1', 2)
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })

    it('should return empty topics when no mention edges', async () => {
      mockSupabase._chain.limit.mockResolvedValue({ data: [], error: null })

      const topics = await client.getTopicsForEntity('person-1')
      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBe(0)
    })

    it('should return null for unknown entity profile', async () => {
      mockSupabase._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const profile = await client.getEntityProfile('nonexistent')
      expect(profile).toBeNull()
    })
  })

  describe('connection management', () => {
    it('should close without error', async () => {
      await expect(client.close()).resolves.toBeUndefined()
    })

    it('should return stats', () => {
      const stats = client.getStats()
      expect(stats).toHaveProperty('nodeCount')
      expect(stats).toHaveProperty('edgeCount')
      expect(stats).toHaveProperty('memoryEstimate')
    })
  })
})

describe('Factory pattern', () => {
  it('should return same instance for same org', () => {
    const mockSb = createMockSupabase()
    const kg1 = getKnowledgeGraph(mockSb as any, 'org-x')
    const kg2 = getKnowledgeGraph(mockSb as any, 'org-x')
    expect(kg1).toBe(kg2)
  })

  it('should return different instances for different orgs', () => {
    const mockSb = createMockSupabase()
    const kg1 = getKnowledgeGraph(mockSb as any, 'org-a')
    const kg2 = getKnowledgeGraph(mockSb as any, 'org-b')
    expect(kg1).not.toBe(kg2)
  })

  it('should clear all instances on close', async () => {
    const mockSb = createMockSupabase()
    getKnowledgeGraph(mockSb as any, 'org-1')
    getKnowledgeGraph(mockSb as any, 'org-2')

    await closeKnowledgeGraph()

    // After close, new calls should create fresh instances
    const fresh = getKnowledgeGraph(mockSb as any, 'org-1')
    expect(fresh).toBeDefined()
  })
})
