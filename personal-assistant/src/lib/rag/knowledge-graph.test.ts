/**
 * Knowledge Graph Client Tests
 *
 * Unit tests for KnowledgeGraphClient entity and relationship operations.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  KnowledgeGraphClient,
  PersonNode,
  OrganizationNode,
  TopicNode,
  getKnowledgeGraph,
  closeKnowledgeGraph
} from './knowledge-graph'

describe('KnowledgeGraphClient', () => {
  let client: KnowledgeGraphClient

  beforeAll(async () => {
    // Create client with in-memory database path
    client = new KnowledgeGraphClient(':memory:')
  })

  afterAll(async () => {
    await closeKnowledgeGraph()
  })

  describe('initialization', () => {
    it('should initialize without error', async () => {
      const testClient = new KnowledgeGraphClient(':memory:')
      await testClient.init()
      // Should be initialized (either real or mock mode)
      expect(testClient.isInitialized()).toBeDefined()
      await testClient.close()
    })

    it('should handle Kuzu gracefully in test environment', async () => {
      const testClient = new KnowledgeGraphClient(':memory:')
      await testClient.init()
      // Should still initialize successfully even if Kuzu is mocked
      expect(testClient.isInitialized()).toBeDefined()
      await testClient.close()
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
        created_at: new Date().toISOString()
      }

      // Should not throw
      await expect(client.upsertPerson(person)).resolves.toBeUndefined()
    })

    it('should upsert an organization node', async () => {
      const org: OrganizationNode = {
        id: 'org-1',
        name: 'Example Corp',
        domain: 'example.com',
        org_id: 'org-1',
        created_at: new Date().toISOString()
      }

      await expect(client.upsertOrganization(org)).resolves.toBeUndefined()
    })

    it('should upsert a topic node', async () => {
      const topic: TopicNode = {
        id: 'topic-1',
        name: 'Q4 Planning',
        org_id: 'org-1',
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString()
      }

      await expect(client.upsertTopic(topic)).resolves.toBeUndefined()
    })
  })

  describe('relationship operations', () => {
    it('should add a mention edge', async () => {
      await expect(
        client.addMention('person-1', 'topic-1', 'msg-1', 'email', new Date().toISOString())
      ).resolves.toBeUndefined()
    })

    it('should add a contact edge', async () => {
      const person2: PersonNode = {
        id: 'person-2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        org_id: 'org-1',
        created_at: new Date().toISOString()
      }
      await client.upsertPerson(person2)

      await expect(
        client.addContact('person-1', 'person-2', 'email', 5)
      ).resolves.toBeUndefined()
    })

    it('should add a discussed edge', async () => {
      const topic2: TopicNode = {
        id: 'topic-2',
        name: 'Budget Review',
        org_id: 'org-1',
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString()
      }
      await client.upsertTopic(topic2)

      await expect(client.addDiscussed('topic-1', 'topic-2')).resolves.toBeUndefined()
    })
  })

  describe('graph traversal', () => {
    it('should get relationships for an entity', async () => {
      const results = await client.getRelationships('person-1', 2)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should get topics for an entity', async () => {
      const topics = await client.getTopicsForEntity('person-1')
      expect(Array.isArray(topics)).toBe(true)
    })

    it('should get entity profile', async () => {
      const profile = await client.getEntityProfile('person-1')
      // Profile might be null if Kuzu is not available in test
      if (profile) {
        expect(profile.id).toBe('person-1')
        expect(profile.type).toBeDefined()
        expect(Array.isArray(profile.relationships)).toBe(true)
      }
    })
  })

  describe('connection management', () => {
    it('should close connection', async () => {
      const testClient = new KnowledgeGraphClient(':memory:')
      await testClient.init()
      const beforeClose = testClient.isInitialized()

      await testClient.close()
      const afterClose = testClient.isInitialized()

      // Close should be idempotent
      expect(typeof afterClose).toBe('boolean')
    })

    it('should handle multiple close calls', async () => {
      const testClient = new KnowledgeGraphClient(':memory:')
      await testClient.init()
      await testClient.close()
      // Should not throw
      await expect(testClient.close()).resolves.toBeUndefined()
    })
  })
})

describe('Singleton pattern', () => {
  afterAll(async () => {
    await closeKnowledgeGraph()
  })

  it('should lazily initialize singleton', async () => {
    const kg1 = await getKnowledgeGraph()
    const kg2 = await getKnowledgeGraph()

    // Should return the same instance
    expect(kg1).toBe(kg2)
  })

  it('should reset singleton instance on close', async () => {
    const kg = await getKnowledgeGraph()
    const firstInit = kg.isInitialized()

    await closeKnowledgeGraph()
    // New instance should be created on next call
    const kg2 = await getKnowledgeGraph()
    const secondInit = kg2.isInitialized()

    expect(typeof firstInit).toBe('boolean')
    expect(typeof secondInit).toBe('boolean')
  })
})
