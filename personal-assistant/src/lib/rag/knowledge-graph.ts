/**
 * Knowledge Graph Database — Supabase-persisted semantic relationship engine
 *
 * Graph database backed by Supabase tables (kg_nodes, kg_edges) for tracking
 * entity relationships (people, organizations, topics). Used by Context
 * Baseplate for semantic understanding and entity profiling.
 *
 * Supports:
 * - Person nodes with contact metadata
 * - Organization nodes with domain info
 * - Topic nodes with temporal metadata
 * - Relationship edges: MENTIONED_IN, DISCUSSED, CONTACTED_BY
 * - BFS graph traversal for entity relationships at configurable depth
 * - In-memory cache with TTL for hot-path reads
 */

import { logger } from '../core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type NodeType = 'Person' | 'Organization' | 'Topic'
export type RelationshipType = 'MENTIONED_IN' | 'DISCUSSED' | 'CONTACTED_BY'

export interface PersonNode {
  id: string
  name: string
  email?: string
  phone?: string
  org_id: string
  created_at: string
}

export interface OrganizationNode {
  id: string
  name: string
  domain?: string
  org_id: string
  created_at: string
}

export interface TopicNode {
  id: string
  name: string
  org_id: string
  first_seen: string
  last_seen: string
}

export interface MentionEdge {
  entity_id: string
  topic_id: string
  message_id: string
  channel: string
  timestamp: string
}

export interface DiscussedEdge {
  topic_a_id: string
  topic_b_id: string
  co_occurrence_count: number
  last_seen: string
}

export interface ContactedByEdge {
  person_a_id: string
  person_b_id: string
  channel: string
  message_count: number
  last_contact: string
}

export interface RelatedEntity {
  id: string
  type: NodeType
  name: string
  distance: number
  relationshipType: RelationshipType
}

export interface EntityProfile {
  id: string
  type: NodeType
  name: string
  metadata: Record<string, unknown>
  relationships: RelatedEntity[]
  topics?: TopicNode[]
}

export interface GraphTraversalResult {
  entity: PersonNode | OrganizationNode | TopicNode
  relatedEntities: RelatedEntity[]
}

// ─── Edge Cache ──────────────────────────────────────────────────────────────

interface CachedEdges {
  edges: Array<{ source_id: string; target_id: string; edge_type: RelationshipType }>
  loadedAt: number
}

/** Per-org edge cache TTL: 2 minutes */
const EDGE_CACHE_TTL_MS = 2 * 60 * 1000

// ─── Knowledge Graph Client ──────────────────────────────────────────────────

export class KnowledgeGraphClient {
  private supabase: SupabaseClient
  private orgId: string
  private edgeCache: CachedEdges | null = null

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase
    this.orgId = orgId
  }

  // kept for API compatibility — no-op since Supabase is always ready
  async init(): Promise<void> {}
  isInitialized(): boolean { return true }

  async upsertPerson(person: PersonNode): Promise<void> {
    try {
      await this.supabase
        .from('kg_nodes')
        .upsert({
          org_id: this.orgId,
          node_type: 'Person',
          entity_id: person.id,
          name: person.name,
          metadata: { email: person.email, phone: person.phone },
        }, { onConflict: 'org_id,entity_id' })

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to upsert person', { person: person.id, error })
    }
  }

  async upsertOrganization(org: OrganizationNode): Promise<void> {
    try {
      await this.supabase
        .from('kg_nodes')
        .upsert({
          org_id: this.orgId,
          node_type: 'Organization',
          entity_id: org.id,
          name: org.name,
          metadata: { domain: org.domain },
        }, { onConflict: 'org_id,entity_id' })

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to upsert organization', { org: org.id, error })
    }
  }

  async upsertTopic(topic: TopicNode): Promise<void> {
    try {
      await this.supabase
        .from('kg_nodes')
        .upsert({
          org_id: this.orgId,
          node_type: 'Topic',
          entity_id: topic.id,
          name: topic.name,
          metadata: { first_seen: topic.first_seen, last_seen: topic.last_seen },
        }, { onConflict: 'org_id,entity_id' })

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to upsert topic', { topic: topic.id, error })
    }
  }

  async addMention(
    entityId: string,
    topicId: string,
    messageId: string,
    channel: string,
    timestamp: string
  ): Promise<void> {
    try {
      // Upsert edge — if exists, merge message_ids array in metadata
      const { data: existing } = await this.supabase
        .from('kg_edges')
        .select('id, metadata')
        .eq('org_id', this.orgId)
        .eq('source_id', entityId)
        .eq('target_id', topicId)
        .eq('edge_type', 'MENTIONED_IN')
        .maybeSingle()

      if (existing) {
        const messageIds = (existing.metadata?.message_ids as string[] ?? [])
        if (!messageIds.includes(messageId)) messageIds.push(messageId)
        await this.supabase
          .from('kg_edges')
          .update({ metadata: { message_ids: messageIds, channel, last_timestamp: timestamp } })
          .eq('id', existing.id)
      } else {
        await this.supabase
          .from('kg_edges')
          .insert({
            org_id: this.orgId,
            source_id: entityId,
            target_id: topicId,
            edge_type: 'MENTIONED_IN',
            metadata: { message_ids: [messageId], channel, timestamp },
          })
      }

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to add mention', { entityId, topicId, error })
    }
  }

  async addContact(
    personAId: string,
    personBId: string,
    channel: string,
    messageCount: number = 1,
    lastContact: string = new Date().toISOString()
  ): Promise<void> {
    try {
      const { data: existing } = await this.supabase
        .from('kg_edges')
        .select('id, metadata')
        .eq('org_id', this.orgId)
        .eq('source_id', personAId)
        .eq('target_id', personBId)
        .eq('edge_type', 'CONTACTED_BY')
        .maybeSingle()

      if (existing) {
        const prevCount = (existing.metadata?.message_count as number) ?? 0
        await this.supabase
          .from('kg_edges')
          .update({
            metadata: {
              ...existing.metadata,
              channel,
              message_count: prevCount + messageCount,
              last_contact: lastContact,
            },
          })
          .eq('id', existing.id)
      } else {
        await this.supabase
          .from('kg_edges')
          .insert({
            org_id: this.orgId,
            source_id: personAId,
            target_id: personBId,
            edge_type: 'CONTACTED_BY',
            metadata: { channel, message_count: messageCount, last_contact: lastContact },
          })
      }

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to add contact edge', { personAId, personBId, error })
    }
  }

  async addDiscussed(
    topicAId: string,
    topicBId: string,
    lastSeen: string = new Date().toISOString()
  ): Promise<void> {
    try {
      const { data: existing } = await this.supabase
        .from('kg_edges')
        .select('id, metadata')
        .eq('org_id', this.orgId)
        .eq('source_id', topicAId)
        .eq('target_id', topicBId)
        .eq('edge_type', 'DISCUSSED')
        .maybeSingle()

      if (existing) {
        const prevCount = (existing.metadata?.co_occurrence_count as number) ?? 0
        await this.supabase
          .from('kg_edges')
          .update({
            metadata: { co_occurrence_count: prevCount + 1, last_seen: lastSeen },
          })
          .eq('id', existing.id)
      } else {
        await this.supabase
          .from('kg_edges')
          .insert({
            org_id: this.orgId,
            source_id: topicAId,
            target_id: topicBId,
            edge_type: 'DISCUSSED',
            metadata: { co_occurrence_count: 1, last_seen: lastSeen },
          })
      }

      this.invalidateEdgeCache()
    } catch (error) {
      logger.error('[knowledge-graph] Failed to add discussed edge', { topicAId, topicBId, error })
    }
  }

  /**
   * BFS traversal to find related entities at given depth.
   * Loads all org edges into memory cache for fast traversal.
   */
  async getRelationships(entityId: string, depth: number = 2): Promise<RelatedEntity[]> {
    try {
      const edges = await this.loadEdges()
      const nodeMap = await this.loadNodeMap()

      const results: RelatedEntity[] = []
      const visited = new Set<string>([entityId])
      const queue: Array<{ nodeId: string; currentDepth: number; viaEdgeType?: RelationshipType }> = [
        { nodeId: entityId, currentDepth: 0 },
      ]

      while (queue.length > 0 && visited.size < 500) {
        const { nodeId, currentDepth, viaEdgeType } = queue.shift()!

        if (currentDepth > 0 && currentDepth <= depth) {
          const node = nodeMap.get(nodeId)
          if (node && nodeId !== entityId) {
            results.push({
              id: nodeId,
              type: node.node_type as NodeType,
              name: node.name,
              distance: currentDepth,
              relationshipType: viaEdgeType || 'MENTIONED_IN',
            })
          }
        }

        if (currentDepth < depth) {
          for (const edge of edges) {
            if (edge.source_id === nodeId && !visited.has(edge.target_id)) {
              visited.add(edge.target_id)
              queue.push({ nodeId: edge.target_id, currentDepth: currentDepth + 1, viaEdgeType: edge.edge_type })
            } else if (edge.target_id === nodeId && !visited.has(edge.source_id)) {
              visited.add(edge.source_id)
              queue.push({ nodeId: edge.source_id, currentDepth: currentDepth + 1, viaEdgeType: edge.edge_type })
            }
          }
        }
      }

      return results
    } catch (error) {
      logger.error('[knowledge-graph] Failed to get relationships', { entityId, depth, error })
      return []
    }
  }

  async getTopicsForEntity(entityId: string): Promise<TopicNode[]> {
    try {
      const { data } = await this.supabase
        .from('kg_edges')
        .select('target_id')
        .eq('org_id', this.orgId)
        .eq('source_id', entityId)
        .eq('edge_type', 'MENTIONED_IN')

      if (!data || data.length === 0) return []

      const topicIds = data.map(e => e.target_id)
      const { data: nodes } = await this.supabase
        .from('kg_nodes')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('node_type', 'Topic')
        .in('entity_id', topicIds)

      return (nodes ?? []).map(n => ({
        id: n.entity_id,
        name: n.name,
        org_id: n.org_id,
        first_seen: n.metadata?.first_seen ?? n.created_at,
        last_seen: n.metadata?.last_seen ?? n.updated_at,
      }))
    } catch (error) {
      logger.error('[knowledge-graph] Failed to get topics', { entityId, error })
      return []
    }
  }

  async getEntityProfile(entityId: string): Promise<EntityProfile | null> {
    try {
      const { data: node } = await this.supabase
        .from('kg_nodes')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('entity_id', entityId)
        .maybeSingle()

      if (!node) return null

      const relationships = await this.getRelationships(entityId, 2)
      const topics = await this.getTopicsForEntity(entityId)

      return {
        id: node.entity_id,
        type: node.node_type as NodeType,
        name: node.name,
        metadata: node.metadata ?? {},
        relationships,
        topics: topics.length > 0 ? topics : undefined,
      }
    } catch (error) {
      logger.error('[knowledge-graph] Failed to get entity profile', { entityId, error })
      return null
    }
  }

  async close(): Promise<void> {
    this.edgeCache = null
  }

  getStats(): { nodeCount: number; edgeCount: number; memoryEstimate: string } {
    const edges = this.edgeCache?.edges ?? []
    return {
      nodeCount: 0, // would need a DB query
      edgeCount: edges.length,
      memoryEstimate: `${((edges.length * 200) / 1024).toFixed(2)} KB (edge cache)`,
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private invalidateEdgeCache(): void {
    this.edgeCache = null
  }

  private async loadEdges(): Promise<CachedEdges['edges']> {
    if (this.edgeCache && (Date.now() - this.edgeCache.loadedAt) < EDGE_CACHE_TTL_MS) {
      return this.edgeCache.edges
    }

    const { data } = await this.supabase
      .from('kg_edges')
      .select('source_id, target_id, edge_type')
      .eq('org_id', this.orgId)
      .limit(5000)

    const edges = (data ?? []) as CachedEdges['edges']
    this.edgeCache = { edges, loadedAt: Date.now() }
    return edges
  }

  private async loadNodeMap(): Promise<Map<string, { entity_id: string; node_type: string; name: string }>> {
    const { data } = await this.supabase
      .from('kg_nodes')
      .select('entity_id, node_type, name')
      .eq('org_id', this.orgId)
      .limit(5000)

    const map = new Map<string, { entity_id: string; node_type: string; name: string }>()
    for (const row of data ?? []) {
      map.set(row.entity_id, row)
    }
    return map
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Per-org client cache (lightweight — just holds the instance ref) */
const clientCache = new Map<string, KnowledgeGraphClient>()

/**
 * Get or create a KnowledgeGraphClient for an org.
 * Uses the provided Supabase client (service-role or user-scoped).
 */
export function getKnowledgeGraph(supabase: SupabaseClient, orgId: string): KnowledgeGraphClient {
  const key = orgId
  let client = clientCache.get(key)
  if (!client) {
    client = new KnowledgeGraphClient(supabase, orgId)
    clientCache.set(key, client)
  }
  return client
}

/**
 * Close and clear all cached knowledge graph clients.
 */
export async function closeKnowledgeGraph(): Promise<void> {
  for (const client of clientCache.values()) {
    await client.close()
  }
  clientCache.clear()
}
