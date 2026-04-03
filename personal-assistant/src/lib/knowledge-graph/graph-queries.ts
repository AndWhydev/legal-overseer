import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  EntityNode,
  EntityEdge,
  EventTuple,
  GraphNeighborhood,
  GraphSearchOptions,
  TimeRange,
} from './types'

/**
 * Find an entity by alias (case-insensitive).
 * Searches the aliases array column for a match.
 */
export async function getEntityByAlias(
  supabase: SupabaseClient,
  orgId: string,
  alias: string
): Promise<EntityNode | null> {
  try {
    const normalised = alias.toLowerCase()
    // Query entities where aliases array contains the alias (case-insensitive)
    // We use ilike on the name as a fallback and check aliases via contains
    const { data, error } = await supabase
      .from('entity_nodes')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.${normalised},aliases.cs.{${normalised}}`)
      .limit(1)
      .single()

    if (error) {
      // PGRST116 = no rows found, not a real error
      if (error.code === 'PGRST116') return null
      logger.warn('getEntityByAlias: query error', { error, alias })
      return null
    }
    return data as EntityNode
  } catch (err) {
    logger.error('getEntityByAlias: unexpected error', { err, alias })
    return null
  }
}

/**
 * Get 1-hop neighborhood of an entity: its edges and connected nodes.
 */
export async function getNeighborhood(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  opts?: GraphSearchOptions
): Promise<GraphNeighborhood | null> {
  try {
    // Get the root node
    const { data: node, error: nodeErr } = await supabase
      .from('entity_nodes')
      .select('*')
      .eq('id', entityId)
      .eq('org_id', orgId)
      .single()

    if (nodeErr || !node) {
      logger.warn('getNeighborhood: node not found', { entityId, nodeErr })
      return null
    }

    // Build edge query for outgoing and incoming edges
    let edgeQuery = supabase
      .from('entity_edges')
      .select('*')
      .eq('org_id', orgId)
      .or(`source_id.eq.${entityId},target_id.eq.${entityId}`)

    // Filter by validity
    if (opts?.validAt) {
      edgeQuery = edgeQuery
        .lte('valid_from', opts.validAt)
        .or(`valid_until.is.null,valid_until.gte.${opts.validAt}`)
    } else {
      edgeQuery = edgeQuery.is('valid_until', null)
    }

    if (opts?.relationTypes && opts.relationTypes.length > 0) {
      edgeQuery = edgeQuery.in('relation_type', opts.relationTypes)
    }

    if (opts?.limit) {
      edgeQuery = edgeQuery.limit(opts.limit)
    }

    const { data: edges, error: edgeErr } = await edgeQuery

    if (edgeErr) {
      logger.warn('getNeighborhood: edge query error', { edgeErr, entityId })
      return { node: node as EntityNode, edges: [], neighbors: [] }
    }

    const typedEdges = (edges || []) as EntityEdge[]

    // Collect neighbor IDs
    const neighborIds = new Set<string>()
    for (const edge of typedEdges) {
      if (edge.source_id !== entityId) neighborIds.add(edge.source_id)
      if (edge.target_id !== entityId) neighborIds.add(edge.target_id)
    }

    let neighbors: EntityNode[] = []
    if (neighborIds.size > 0) {
      let neighborQuery = supabase
        .from('entity_nodes')
        .select('*')
        .eq('org_id', orgId)
        .in('id', Array.from(neighborIds))

      if (!opts?.includeInactive) {
        neighborQuery = neighborQuery.eq('is_active', true)
      }

      const { data: neighborData, error: neighborErr } = await neighborQuery
      if (neighborErr) {
        logger.warn('getNeighborhood: neighbor query error', { neighborErr })
      } else {
        neighbors = (neighborData || []) as EntityNode[]
      }
    }

    return {
      node: node as EntityNode,
      edges: typedEdges,
      neighbors,
    }
  } catch (err) {
    logger.error('getNeighborhood: unexpected error', { err, entityId })
    return null
  }
}

/**
 * Multi-hop neighborhood traversal (iterative BFS up to depth, max 3).
 */
export async function getMultiHopNeighborhood(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  depth: number = 2,
  opts?: GraphSearchOptions
): Promise<{ nodes: EntityNode[]; edges: EntityEdge[] }> {
  const maxDepth = Math.min(depth, 3)
  const allNodes = new Map<string, EntityNode>()
  const allEdges = new Map<string, EntityEdge>()
  const visited = new Set<string>()
  let frontier = new Set<string>([entityId])

  try {
    for (let hop = 0; hop < maxDepth; hop++) {
      if (frontier.size === 0) break

      const toVisit = Array.from(frontier).filter((id) => !visited.has(id))
      if (toVisit.length === 0) break

      const nextFrontier = new Set<string>()

      for (const nodeId of toVisit) {
        visited.add(nodeId)
        const neighborhood = await getNeighborhood(supabase, orgId, nodeId, opts)
        if (!neighborhood) continue

        allNodes.set(neighborhood.node.id, neighborhood.node)
        for (const edge of neighborhood.edges) {
          allEdges.set(edge.id, edge)
        }
        for (const neighbor of neighborhood.neighbors) {
          allNodes.set(neighbor.id, neighbor)
          if (!visited.has(neighbor.id)) {
            nextFrontier.add(neighbor.id)
          }
        }
      }

      frontier = nextFrontier
    }

    return {
      nodes: Array.from(allNodes.values()),
      edges: Array.from(allEdges.values()),
    }
  } catch (err) {
    logger.error('getMultiHopNeighborhood: unexpected error', { err, entityId })
    return { nodes: [], edges: [] }
  }
}

/**
 * Get event tuples for an entity, ordered by occurred_at DESC.
 */
export async function getEntityEvents(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  timeRange?: TimeRange
): Promise<EventTuple[]> {
  try {
    let query = supabase
      .from('event_tuples')
      .select('*')
      .eq('org_id', orgId)
      .eq('subject_id', entityId)
      .order('occurred_at', { ascending: false })

    if (timeRange?.from) {
      query = query.gte('occurred_at', timeRange.from)
    }
    if (timeRange?.to) {
      query = query.lte('occurred_at', timeRange.to)
    }

    const { data, error } = await query

    if (error) {
      logger.warn('getEntityEvents: query error', { error, entityId })
      return []
    }
    return (data || []) as EventTuple[]
  } catch (err) {
    logger.error('getEntityEvents: unexpected error', { err, entityId })
    return []
  }
}

/**
 * Vector similarity search using the match_entity_nodes RPC function.
 */
export async function vectorSearchEntities(
  supabase: SupabaseClient,
  orgId: string,
  queryEmbedding: number[],
  topK: number = 10
): Promise<Array<{ id: string; name: string; entity_type: string; properties: Record<string, unknown>; similarity: number }>> {
  try {
    const { data, error } = await supabase.rpc('match_entity_nodes', {
      query_embedding: queryEmbedding,
      match_org_id: orgId,
      match_count: topK,
    })

    if (error) {
      logger.warn('vectorSearchEntities: rpc error', { error })
      return []
    }
    return data || []
  } catch (err) {
    logger.error('vectorSearchEntities: unexpected error', { err })
    return []
  }
}

/**
 * Find an existing entity by alias/name or create a new one.
 */
export async function findOrCreateEntity(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  type: EntityNode['entity_type'],
  aliases?: string[]
): Promise<EntityNode | null> {
  try {
    // Check name and each alias
    const candidates = [name, ...(aliases || [])]
    for (const candidate of candidates) {
      const existing = await getEntityByAlias(supabase, orgId, candidate)
      if (existing) return existing
    }

    // Not found, create new entity
    const allAliases = aliases || []
    // Ensure the name is also in aliases for future lookups
    const lowerName = name.toLowerCase()
    if (!allAliases.some((a) => a.toLowerCase() === lowerName)) {
      allAliases.push(name.toLowerCase())
    }

    const { data, error } = await supabase
      .from('entity_nodes')
      .insert({
        org_id: orgId,
        entity_type: type,
        name,
        aliases: allAliases.map((a) => a.toLowerCase()),
        properties: {},
      })
      .select('*')
      .single()

    if (error) {
      logger.error('findOrCreateEntity: insert error', { error, name, type })
      return null
    }
    return data as EntityNode
  } catch (err) {
    logger.error('findOrCreateEntity: unexpected error', { err, name })
    return null
  }
}

/**
 * Create an edge, auto-invalidating any prior edge with the same
 * (source_id, target_id, relation_type) by setting valid_until = now().
 */
export async function createEdge(
  supabase: SupabaseClient,
  orgId: string,
  sourceId: string,
  targetId: string,
  relationType: string,
  props?: Record<string, unknown>
): Promise<EntityEdge | null> {
  try {
    // Invalidate existing edges of the same type between these nodes
    const { error: updateErr } = await supabase
      .from('entity_edges')
      .update({ valid_until: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('source_id', sourceId)
      .eq('target_id', targetId)
      .eq('relation_type', relationType)
      .is('valid_until', null)

    if (updateErr) {
      logger.warn('createEdge: failed to invalidate prior edges', { updateErr })
    }

    // Insert new edge
    const { data, error } = await supabase
      .from('entity_edges')
      .insert({
        org_id: orgId,
        source_id: sourceId,
        target_id: targetId,
        relation_type: relationType,
        properties: props || {},
        valid_from: new Date().toISOString(),
        confidence: 0.8,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('createEdge: insert error', { error, sourceId, targetId, relationType })
      return null
    }
    return data as EntityEdge
  } catch (err) {
    logger.error('createEdge: unexpected error', { err })
    return null
  }
}

/**
 * Insert an event tuple (subject-verb-object).
 */
export async function createEventTuple(
  supabase: SupabaseClient,
  orgId: string,
  subjectId: string,
  verb: string,
  objectText: string | null,
  occurredAt: string,
  objectId?: string
): Promise<EventTuple | null> {
  try {
    const { data, error } = await supabase
      .from('event_tuples')
      .insert({
        org_id: orgId,
        subject_id: subjectId,
        verb,
        object_text: objectText,
        object_id: objectId || null,
        occurred_at: occurredAt,
        metadata: {},
      })
      .select('*')
      .single()

    if (error) {
      logger.error('createEventTuple: insert error', { error, subjectId, verb })
      return null
    }
    return data as EventTuple
  } catch (err) {
    logger.error('createEventTuple: unexpected error', { err })
    return null
  }
}
