/**
 * Knowledge Graph Database — Embedded semantic relationship engine
 *
 * In-process graph database for tracking entity relationships (people, organizations, topics).
 * Used by Context Baseplate for semantic understanding and entity profiling.
 *
 * This is a lightweight in-memory implementation suitable for:
 * - Development and testing
 * - Small-scale deployments (Fly.io workers with limited memory)
 * - Rapid iteration
 *
 * For production with large entity graphs, consider migrating to:
 * - Kuzu (GraphQL-like query language via Python bindings)
 * - Neo4j (enterprise graph database)
 * - DuckDB (analytical SQL queries on graph data)
 *
 * Supports:
 * - Person nodes with contact metadata
 * - Organization nodes with domain info
 * - Topic nodes with temporal metadata
 * - Relationship edges: MENTIONED_IN, DISCUSSED, CONTACTED_BY
 * - Graph traversal for entity relationships at configurable depth
 */

import { logger } from '../core/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported node types in the knowledge graph */
export type NodeType = 'Person' | 'Organization' | 'Topic'

/** Supported relationship edge types */
export type RelationshipType = 'MENTIONED_IN' | 'DISCUSSED' | 'CONTACTED_BY'

/** Person node in the knowledge graph */
export interface PersonNode {
  id: string
  name: string
  email?: string
  phone?: string
  org_id: string
  created_at: string
}

/** Organization node in the knowledge graph */
export interface OrganizationNode {
  id: string
  name: string
  domain?: string
  org_id: string
  created_at: string
}

/** Topic node in the knowledge graph */
export interface TopicNode {
  id: string
  name: string
  org_id: string
  first_seen: string
  last_seen: string
}

/** MENTIONED_IN edge: entity mentioned in topic context */
export interface MentionEdge {
  entity_id: string
  topic_id: string
  message_id: string
  channel: string
  timestamp: string
}

/** DISCUSSED edge: topic co-occurrence */
export interface DiscussedEdge {
  topic_a_id: string
  topic_b_id: string
  co_occurrence_count: number
  last_seen: string
}

/** CONTACTED_BY edge: person-to-person communication */
export interface ContactedByEdge {
  person_a_id: string
  person_b_id: string
  channel: string
  message_count: number
  last_contact: string
}

/** Related entity in graph traversal results */
export interface RelatedEntity {
  id: string
  type: NodeType
  name: string
  distance: number
  relationshipType: RelationshipType
}

/** Full entity profile with relationships */
export interface EntityProfile {
  id: string
  type: NodeType
  name: string
  metadata: Record<string, unknown>
  relationships: RelatedEntity[]
  topics?: TopicNode[]
}

/** Graph traversal result */
export interface GraphTraversalResult {
  entity: PersonNode | OrganizationNode | TopicNode
  relatedEntities: RelatedEntity[]
}

// ─── In-Memory Graph Storage ─────────────────────────────────────────────────

/** In-memory storage for graph nodes */
interface StoredNode {
  type: NodeType
  id: string
  data: Record<string, unknown>
}

/** In-memory storage for graph edges */
interface StoredEdge {
  source: string
  target: string
  type: RelationshipType
  data: Record<string, unknown>
}

// ─── Knowledge Graph Client ──────────────────────────────────────────────────

/**
 * In-process semantic relationship engine using an in-memory graph.
 * Manages entity nodes and relationship edges for context assembly.
 *
 * This lightweight implementation trades persistence for simplicity and portability.
 * It's ideal for Fly.io worker deployments and rapid iteration.
 */
export class KnowledgeGraphClient {
  private nodes: Map<string, StoredNode> = new Map()
  private edges: StoredEdge[] = []
  private dbPath: string
  private initialized: boolean = false

  /**
   * Create a new KnowledgeGraphClient
   * @param dbPath Path for potential persistence (currently in-memory, kept for future compatibility)
   */
  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath()
  }

  /**
   * Get default database path from environment or use convention
   */
  private getDefaultDbPath(): string {
    if (typeof process !== 'undefined' && process.env.KUZU_DB_PATH) {
      return process.env.KUZU_DB_PATH
    }
    return `${process.cwd()}/data/knowledge-graph`
  }

  /**
   * Initialize the graph database (no-op for in-memory, kept for API compatibility)
   */
  async init(): Promise<void> {
    try {
      // In-memory graph is always ready
      this.initialized = true
      logger.info('Knowledge graph initialized (in-memory)', { dbPath: this.dbPath })
    } catch (error) {
      logger.error('Failed to initialize knowledge graph', { error, dbPath: this.dbPath })
      throw error
    }
  }

  /**
   * Upsert (insert or update) a Person node
   */
  async upsertPerson(person: PersonNode): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      const nodeId = `person:${person.id}`
      this.nodes.set(nodeId, {
        type: 'Person',
        id: person.id,
        data: person as unknown as Record<string, unknown>
      })
      logger.debug('Person upserted', { personId: person.id, name: person.name })
    } catch (error) {
      logger.error('Failed to upsert person', { person, error })
      throw error
    }
  }

  /**
   * Upsert an Organization node
   */
  async upsertOrganization(org: OrganizationNode): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      const nodeId = `organization:${org.id}`
      this.nodes.set(nodeId, {
        type: 'Organization',
        id: org.id,
        data: org as unknown as Record<string, unknown>
      })
      logger.debug('Organization upserted', { orgId: org.id, name: org.name })
    } catch (error) {
      logger.error('Failed to upsert organization', { org, error })
      throw error
    }
  }

  /**
   * Upsert a Topic node
   */
  async upsertTopic(topic: TopicNode): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      const nodeId = `topic:${topic.id}`
      this.nodes.set(nodeId, {
        type: 'Topic',
        id: topic.id,
        data: topic as unknown as Record<string, unknown>
      })
      logger.debug('Topic upserted', { topicId: topic.id, name: topic.name })
    } catch (error) {
      logger.error('Failed to upsert topic', { topic, error })
      throw error
    }
  }

  /**
   * Create a MENTIONED_IN edge: entity mentioned in topic context
   */
  async addMention(
    entityId: string,
    topicId: string,
    messageId: string,
    channel: string,
    timestamp: string
  ): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      // Find entity node (either Person or Organization)
      const entityNode = this.findNodeById(entityId)
      if (!entityNode) {
        logger.warn('Entity not found for mention edge', { entityId })
        return
      }

      // Check if topic exists
      const topicNode = this.findNodeById(topicId)
      if (!topicNode) {
        logger.warn('Topic not found for mention edge', { topicId })
        return
      }

      // Create or update edge
      const edgeKey = `${entityNode.id}-MENTIONED_IN-${topicNode.id}`
      const existingEdge = this.edges.find(
        (e) => e.source === entityNode.id && e.target === topicNode.id && e.type === 'MENTIONED_IN'
      )

      if (existingEdge) {
        // Update existing edge
        const messageIds = (existingEdge.data.message_ids as string[] || [])
        messageIds.push(messageId)
        existingEdge.data.message_ids = messageIds
        existingEdge.data.last_timestamp = timestamp
      } else {
        // Create new edge
        this.edges.push({
          source: entityNode.id,
          target: topicNode.id,
          type: 'MENTIONED_IN',
          data: { messageId, channel, timestamp }
        })
      }

      logger.debug('Mention edge created', { entityId, topicId, channel })
    } catch (error) {
      logger.error('Failed to add mention edge', { entityId, topicId, error })
      throw error
    }
  }

  /**
   * Create or update a CONTACTED_BY edge: person-to-person communication
   */
  async addContact(
    personAId: string,
    personBId: string,
    channel: string,
    messageCount: number = 1,
    lastContact: string = new Date().toISOString()
  ): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      // Find person nodes
      const personA = this.findNodeById(personAId)
      const personB = this.findNodeById(personBId)

      if (!personA || !personB) {
        logger.warn('Person not found for contact edge', { personAId, personBId })
        return
      }

      // Find or create edge
      const existingEdge = this.edges.find(
        (e) => e.source === personA.id && e.target === personB.id && e.type === 'CONTACTED_BY'
      )

      if (existingEdge) {
        existingEdge.data.message_count = (existingEdge.data.message_count as number || 1) + messageCount
        existingEdge.data.last_contact = lastContact
      } else {
        this.edges.push({
          source: personA.id,
          target: personB.id,
          type: 'CONTACTED_BY',
          data: { channel, message_count: messageCount, last_contact: lastContact }
        })
      }

      logger.debug('Contact edge created/updated', { personAId, personBId, channel })
    } catch (error) {
      logger.error('Failed to add contact edge', { personAId, personBId, error })
      throw error
    }
  }

  /**
   * Create or update a DISCUSSED edge: topic co-occurrence
   */
  async addDiscussed(
    topicAId: string,
    topicBId: string,
    lastSeen: string = new Date().toISOString()
  ): Promise<void> {
    if (!this.initialized) await this.init()

    try {
      // Find topic nodes
      const topicA = this.findNodeById(topicAId)
      const topicB = this.findNodeById(topicBId)

      if (!topicA || !topicB) {
        logger.warn('Topic not found for discussed edge', { topicAId, topicBId })
        return
      }

      // Find or create edge
      const existingEdge = this.edges.find(
        (e) => e.source === topicA.id && e.target === topicB.id && e.type === 'DISCUSSED'
      )

      if (existingEdge) {
        existingEdge.data.co_occurrence_count = (existingEdge.data.co_occurrence_count as number || 1) + 1
        existingEdge.data.last_seen = lastSeen
      } else {
        this.edges.push({
          source: topicA.id,
          target: topicB.id,
          type: 'DISCUSSED',
          data: { co_occurrence_count: 1, last_seen: lastSeen }
        })
      }

      logger.debug('Discussed edge created/updated', { topicAId, topicBId })
    } catch (error) {
      logger.error('Failed to add discussed edge', { topicAId, topicBId, error })
      throw error
    }
  }

  /**
   * Find a node in the graph by entity ID (without type prefix)
   */
  private findNodeById(entityId: string): StoredNode | undefined {
    const nodeArray = Array.from(this.nodes.values())
    for (let i = 0; i < nodeArray.length; i++) {
      const node = nodeArray[i]
      if (node.id === entityId) {
        return node
      }
    }
    return undefined
  }

  /**
   * Get all relationships for an entity at specified depth using BFS traversal
   * @param entityId The entity ID to traverse from
   * @param depth Maximum relationship depth (default: 2)
   */
  async getRelationships(entityId: string, depth: number = 2): Promise<RelatedEntity[]> {
    if (!this.initialized) await this.init()

    try {
      const results: RelatedEntity[] = []
      const visited: Record<string, boolean> = {}
      const queue: Array<{ nodeId: string; currentDepth: number }> = [{ nodeId: entityId, currentDepth: 0 }]

      visited[entityId] = true

      while (queue.length > 0 && Object.keys(visited).length < 1000) {
        // Limit to prevent infinite loops
        const { nodeId, currentDepth } = queue.shift()!

        if (currentDepth > 0 && currentDepth <= depth) {
          // Get the node
          const node = this.findNodeById(nodeId)
          if (node && nodeId !== entityId) {
            // Find relationship type
            const edge = this.edges.find(
              (e) =>
                (e.source === entityId && e.target === nodeId) ||
                (e.source === nodeId && e.target === entityId)
            )

            results.push({
              id: nodeId,
              type: node.type,
              name: (node.data.name as string) || 'Unknown',
              distance: currentDepth,
              relationshipType: (edge?.type || 'MENTIONED_IN') as RelationshipType
            })
          }
        }

        // Add connected nodes to queue
        if (currentDepth < depth) {
          for (const edge of this.edges) {
            if (edge.source === nodeId && !visited[edge.target]) {
              visited[edge.target] = true
              queue.push({ nodeId: edge.target, currentDepth: currentDepth + 1 })
            } else if (edge.target === nodeId && !visited[edge.source]) {
              visited[edge.source] = true
              queue.push({ nodeId: edge.source, currentDepth: currentDepth + 1 })
            }
          }
        }
      }

      return results
    } catch (error) {
      logger.error('Failed to get relationships', { entityId, depth, error })
      return []
    }
  }

  /**
   * Get all topics an entity is mentioned in
   */
  async getTopicsForEntity(entityId: string): Promise<TopicNode[]> {
    if (!this.initialized) await this.init()

    try {
      const results: TopicNode[] = []

      // Find edges from this entity with MENTIONED_IN relationship
      for (const edge of this.edges) {
        if (edge.source === entityId && edge.type === 'MENTIONED_IN') {
          const topicNode = this.findNodeById(edge.target)
          if (topicNode && topicNode.type === 'Topic') {
            results.push(topicNode.data as unknown as TopicNode)
          }
        }
      }

      return results
    } catch (error) {
      logger.error('Failed to get topics for entity', { entityId, error })
      return []
    }
  }

  /**
   * Get full entity profile including all relationships
   */
  async getEntityProfile(entityId: string): Promise<EntityProfile | null> {
    if (!this.initialized) await this.init()

    try {
      const node = this.findNodeById(entityId)
      if (!node) return null

      // Get relationships
      const relationships = await this.getRelationships(entityId, 2)

      // Get topics if applicable
      const topics = await this.getTopicsForEntity(entityId)

      return {
        id: node.id,
        type: node.type,
        name: (node.data.name as string) || 'Unknown',
        metadata: node.data,
        relationships,
        topics: topics.length > 0 ? topics : undefined
      }
    } catch (error) {
      logger.error('Failed to get entity profile', { entityId, error })
      return null
    }
  }

  /**
   * Close the database connection (clears in-memory storage)
   */
  async close(): Promise<void> {
    try {
      this.nodes.clear()
      this.edges = []
      this.initialized = false
      logger.info('Knowledge graph connection closed')
    } catch (error) {
      logger.error('Failed to close knowledge graph', { error })
      throw error
    }
  }

  /**
   * Check if database is initialized and ready
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get memory usage statistics (for monitoring)
   */
  getStats(): { nodeCount: number; edgeCount: number; memoryEstimate: string } {
    const nodeCount = this.nodes.size
    const edgeCount = this.edges.length

    // Very rough estimate: ~1KB per node, ~200 bytes per edge
    const estimateBytes = nodeCount * 1024 + edgeCount * 200
    const memoryEstimate = `${(estimateBytes / 1024).toFixed(2)} KB`

    return { nodeCount, edgeCount, memoryEstimate }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let graphInstance: KnowledgeGraphClient | null = null

/**
 * Get or create singleton instance of KnowledgeGraphClient.
 * Lazy initialization allows graceful fallback in environments without Kuzu.
 */
export async function getKnowledgeGraph(dbPath?: string): Promise<KnowledgeGraphClient> {
  if (!graphInstance) {
    graphInstance = new KnowledgeGraphClient(dbPath)
    await graphInstance.init()
  }
  return graphInstance
}

/**
 * Get existing knowledge graph instance without initialization.
 * Returns null if not yet initialized.
 */
export function getKnowledgeGraphSync(): KnowledgeGraphClient | null {
  return graphInstance
}

/**
 * Close knowledge graph connection (useful for cleanup in tests)
 */
export async function closeKnowledgeGraph(): Promise<void> {
  if (graphInstance) {
    await graphInstance.close()
    graphInstance = null
  }
}
