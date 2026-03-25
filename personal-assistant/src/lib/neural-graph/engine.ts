/**
 * Neural Knowledge Graph Engine
 *
 * Core engine for the brain-like associative memory system with Hebbian learning,
 * spreading activation, temporal decay, and co-occurrence extraction.
 *
 * All functions are pure — take (supabase, orgId, ...) as first parameters with no class state.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NeuralNode,
  NeuralNodeType,
  SynapseType,
  ActivationResult,
  Synapse,
  GraphCluster,
  NeuralGraphStats,
} from './types'
import { logger } from '@/lib/core/logger'

// ─── Activation: Spreading activation from seed entity ─────────────────────

export async function activate(
  supabase: SupabaseClient,
  orgId: string,
  seedEntityId: string,
  opts?: {
    maxDepth?: number
    decayFactor?: number
    minActivation?: number
  }
): Promise<ActivationResult[]> {
  try {
    const maxDepth = opts?.maxDepth ?? 3
    const decayFactor = opts?.decayFactor ?? 0.7
    const minActivation = opts?.minActivation ?? 0.01
    const timeDecayLambda = 0.1 // temporal decay rate

    // Call spreading_activation RPC
    const { data, error } = await supabase.rpc('spreading_activation', {
      org_id: orgId,
      seed_entity_id: seedEntityId,
      max_depth: maxDepth,
      decay_factor: decayFactor,
      min_activation: minActivation,
      time_decay_lambda: timeDecayLambda,
    })

    if (error) {
      logger.error('[neural-engine] spreading_activation RPC failed', { orgId, seedEntityId, error: error.message })
      return []
    }

    // Update seed node's fire_count and last_fired_at
    const now = new Date().toISOString()
    await supabase
      .from('kg_nodes')
      .update({
        fire_count: supabase.rpc('increment_counter'),
        last_fired_at: now,
      })
      .eq('org_id', orgId)
      .eq('entity_id', seedEntityId) // non-critical, fire and forget

    // Map RPC result to ActivationResult[]
    const results = (data ?? []) as Array<{
      entity_id: string
      node_type: string
      name: string
      activation: number
      depth: number
      path: string[]
    }>

    return results.map(r => ({
      entityId: r.entity_id,
      nodeType: r.node_type,
      name: r.name,
      activation: r.activation,
      depth: r.depth,
      path: r.path,
    }))
  } catch (err) {
    logger.error('[neural-engine] activate failed', { orgId, seedEntityId, error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

// ─── Strengthen: Hebbian learning on a synapse ───────────────────────────────

export async function strengthen(
  supabase: SupabaseClient,
  orgId: string,
  sourceId: string,
  targetId: string,
  edgeType: SynapseType = 'CO_OCCURS',
  learningRate: number = 0.1
): Promise<void> {
  try {
    const { error } = await supabase.rpc('hebbian_strengthen', {
      org_id: orgId,
      source_id: sourceId,
      target_id: targetId,
      edge_type: edgeType,
      learning_rate: learningRate,
    })

    if (error) {
      logger.error('[neural-engine] hebbian_strengthen RPC failed', {
        orgId,
        sourceId,
        targetId,
        edgeType,
        error: error.message,
      })
    }
  } catch (err) {
    logger.error('[neural-engine] strengthen failed', {
      orgId,
      sourceId,
      targetId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Batch strengthen: Apply Hebbian learning to multiple pairs ────────────

export async function strengthenBatch(
  supabase: SupabaseClient,
  orgId: string,
  pairs: [string, string][],
  edgeType: SynapseType = 'CO_OCCURS'
): Promise<void> {
  if (pairs.length === 0) return

  try {
    await Promise.all(
      pairs.map(([sourceId, targetId]) =>
        strengthen(supabase, orgId, sourceId, targetId, edgeType)
      )
    )
  } catch (err) {
    logger.error('[neural-engine] strengthenBatch failed', {
      orgId,
      count: pairs.length,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Node operations ──────────────────────────────────────────────────────

/**
 * Slugify: Convert "Real Estate" to "real-estate"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Upsert a node, merging aliases and metadata if it exists
 */
export async function upsertNode(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  name: string,
  nodeType: NeuralNodeType,
  opts?: {
    description?: string
    aliases?: string[]
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    // Check if node exists
    const { data: existing } = await supabase
      .from('kg_nodes')
      .select('id, aliases, metadata')
      .eq('org_id', orgId)
      .eq('entity_id', entityId)
      .maybeSingle()

    const mergedAliases = existing
      ? Array.from(new Set([...(existing.aliases ?? []), ...(opts?.aliases ?? [])]))
      : opts?.aliases ?? []

    const mergedMetadata = {
      ...(existing?.metadata ?? {}),
      ...(opts?.metadata ?? {}),
    }

    await supabase
      .from('kg_nodes')
      .upsert(
        {
          org_id: orgId,
          entity_id: entityId,
          node_type: nodeType,
          name,
          description: opts?.description ?? null,
          aliases: mergedAliases,
          metadata: mergedMetadata,
          activation_level: 0,
          fire_count: existing ? undefined : 0,
          last_fired_at: null,
          created_at: existing ? undefined : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,entity_id' }
      )
      .select()
  } catch (err) {
    logger.error('[neural-engine] upsertNode failed', {
      orgId,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Find node by name: exact match > alias match > full-text search
 */
export async function findNodeByName(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  nodeType?: NeuralNodeType
): Promise<NeuralNode | null> {
  try {
    const nameLower = name.toLowerCase().trim()

    // 1. Exact name match
    let { data } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .ilike('name', name)
      .limit(1)

    if (data && data.length > 0) {
      const row = data[0]
      return mapRowToNeuralNode(row)
    }

    // 2. Alias match (any alias contains name)
    const { data: aliasMatches } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .contains('aliases', [name])
      .limit(1)

    if (aliasMatches && aliasMatches.length > 0) {
      return mapRowToNeuralNode(aliasMatches[0])
    }

    // 3. Full-text search on search_tsv
    const { data: ftsMatches } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .textSearch('search_tsv', nameLower)
      .limit(1)

    if (ftsMatches && ftsMatches.length > 0) {
      return mapRowToNeuralNode(ftsMatches[0])
    }

    return null
  } catch (err) {
    logger.error('[neural-engine] findNodeByName failed', {
      orgId,
      name,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Find or create: returns entityId (either found or newly generated)
 */
export async function findOrCreate(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  nodeType: NeuralNodeType,
  opts?: {
    description?: string
    aliases?: string[]
    metadata?: Record<string, unknown>
  }
): Promise<string> {
  try {
    // Try to find existing
    const existing = await findNodeByName(supabase, orgId, name, nodeType)
    if (existing) {
      return existing.entityId
    }

    // Generate new entityId by slugifying name
    const entityId = slugify(name) || `node-${Date.now()}`

    // Create new node
    await upsertNode(supabase, orgId, entityId, name, nodeType, opts)

    return entityId
  } catch (err) {
    logger.error('[neural-engine] findOrCreate failed', {
      orgId,
      name,
      error: err instanceof Error ? err.message : String(err),
    })
    // Fallback: create a unique ID
    return `node-${Date.now()}-${Math.random()}`
  }
}

// ─── Neighbor traversal ───────────────────────────────────────────────────

export interface NeighborResult {
  node: NeuralNode
  synapse: Synapse
}

export async function getNeighbors(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  opts?: {
    minWeight?: number
    limit?: number
    edgeTypes?: SynapseType[]
  }
): Promise<NeighborResult[]> {
  try {
    const minWeight = opts?.minWeight ?? 0
    const limit = opts?.limit ?? 100
    const edgeTypes = opts?.edgeTypes ?? []

    // Build query
    let edgesQuery = supabase
      .from('kg_edges')
      .select('*')
      .eq('org_id', orgId)
      .eq('source_id', entityId)
      .gte('weight', minWeight)
      .order('weight', { ascending: false })
      .limit(limit)

    if (edgeTypes.length > 0) {
      edgesQuery = edgesQuery.in('edge_type', edgeTypes)
    }

    const { data: edges } = await edgesQuery

    if (!edges || edges.length === 0) return []

    // Fetch all target nodes
    const targetIds = edges.map(e => e.target_id)
    const { data: nodes } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .in('entity_id', targetIds)

    if (!nodes) return []

    // Map nodes by entityId for quick lookup
    const nodeMap = new Map(nodes.map(n => [n.entity_id, n]))

    // Combine into results
    const results: NeighborResult[] = []
    for (const edge of edges) {
      const node = nodeMap.get(edge.target_id)
      if (node) {
        results.push({
          node: mapRowToNeuralNode(node),
          synapse: mapRowToSynapse(edge),
        })
      }
    }

    return results
  } catch (err) {
    logger.error('[neural-engine] getNeighbors failed', {
      orgId,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ─── Pathfinding ─────────────────────────────────────────────────────────

export interface PathResult {
  nodes: NeuralNode[]
  edges: Synapse[]
  totalWeight: number
}

export async function findPath(
  supabase: SupabaseClient,
  orgId: string,
  fromEntityId: string,
  toEntityId: string,
  maxDepth: number = 5
): Promise<PathResult | null> {
  try {
    // Load all edges and nodes for this org
    const { data: allEdges } = await supabase
      .from('kg_edges')
      .select('*')
      .eq('org_id', orgId)

    const { data: allNodes } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)

    if (!allEdges || !allNodes) return null

    const nodeMap = new Map(allNodes.map(n => [n.entity_id, n]))
    const edgeMap = new Map<string, typeof allEdges>()

    // Build adjacency: sourceId -> [edges]
    for (const edge of allEdges) {
      const key = edge.source_id
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key)!.push(edge)
    }

    // BFS
    interface QueueItem {
      entityId: string
      path: string[]
      edges: typeof allEdges
      depth: number
    }

    const queue: QueueItem[] = [{ entityId: fromEntityId, path: [fromEntityId], edges: [], depth: 0 }]
    const visited = new Set<string>([fromEntityId])

    while (queue.length > 0) {
      const { entityId, path, edges: pathEdges, depth } = queue.shift()!

      if (entityId === toEntityId) {
        // Found path
        const nodes = path.map(id => nodeMap.get(id)).filter(Boolean) as typeof allNodes
        const totalWeight = pathEdges.reduce((sum, e) => sum + (e.weight ?? 0), 0)
        return {
          nodes: nodes.map(mapRowToNeuralNode),
          edges: pathEdges.map(mapRowToSynapse),
          totalWeight,
        }
      }

      if (depth >= maxDepth) continue

      // Explore neighbors
      const neighbors = edgeMap.get(entityId) ?? []
      for (const edge of neighbors) {
        if (!visited.has(edge.target_id)) {
          visited.add(edge.target_id)
          queue.push({
            entityId: edge.target_id,
            path: [...path, edge.target_id],
            edges: [...pathEdges, edge],
            depth: depth + 1,
          })
        }
      }
    }

    return null
  } catch (err) {
    logger.error('[neural-engine] findPath failed', {
      orgId,
      from: fromEntityId,
      to: toEntityId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── Clustering ──────────────────────────────────────────────────────────

export async function getClusters(
  supabase: SupabaseClient,
  orgId: string,
  opts?: {
    minWeight?: number
    minClusterSize?: number
  }
): Promise<GraphCluster[]> {
  try {
    const minWeight = opts?.minWeight ?? 0.1
    const minClusterSize = opts?.minClusterSize ?? 2

    // Load all nodes and edges
    const { data: allNodes } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)

    const { data: allEdges } = await supabase
      .from('kg_edges')
      .select('*')
      .eq('org_id', orgId)
      .gte('weight', minWeight)

    if (!allNodes || !allEdges) return []

    const nodeMap = new Map(allNodes.map(n => [n.entity_id, n]))

    // Build adjacency
    const adj = new Map<string, Set<string>>()
    for (const node of allNodes) {
      adj.set(node.entity_id, new Set())
    }
    for (const edge of allEdges) {
      adj.get(edge.source_id)?.add(edge.target_id)
      adj.get(edge.target_id)?.add(edge.source_id) // undirected
    }

    // Connected component analysis (DFS)
    const visited = new Set<string>()
    const clusters: GraphCluster[] = []

    for (const startId of adj.keys()) {
      if (visited.has(startId)) continue

      const component: string[] = []
      const stack = [startId]

      while (stack.length > 0) {
        const nodeId = stack.pop()!
        if (visited.has(nodeId)) continue

        visited.add(nodeId)
        component.push(nodeId)

        const neighbors = adj.get(nodeId) ?? new Set()
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) stack.push(neighbor)
        }
      }

      if (component.length < minClusterSize) continue

      // Label: name of highest fire_count node
      let maxFireCount = 0
      let labelId = component[0]
      for (const nodeId of component) {
        const node = nodeMap.get(nodeId)
        if (node && node.fire_count > maxFireCount) {
          maxFireCount = node.fire_count
          labelId = nodeId
        }
      }

      const labelNode = nodeMap.get(labelId)
      const label = labelNode?.name ?? labelId

      // Compute average weight of edges within cluster
      let totalWeight = 0
      let edgeCount = 0
      const componentSet = new Set(component)
      for (const edge of allEdges) {
        if (componentSet.has(edge.source_id) && componentSet.has(edge.target_id)) {
          totalWeight += edge.weight ?? 0
          edgeCount++
        }
      }
      const avgWeight = edgeCount > 0 ? totalWeight / edgeCount : 0

      clusters.push({
        id: `cluster-${clusters.length}`,
        label,
        nodeIds: component,
        avgWeight,
      })
    }

    return clusters
  } catch (err) {
    logger.error('[neural-engine] getClusters failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ─── Statistics ──────────────────────────────────────────────────────────

export async function getStats(supabase: SupabaseClient, orgId: string): Promise<NeuralGraphStats> {
  try {
    // Count nodes
    const { count: nodeCount } = await supabase
      .from('kg_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)

    // Count edges
    const { count: edgeCount } = await supabase
      .from('kg_edges')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)

    // Average weight
    const { data: weightData } = await supabase
      .from('kg_edges')
      .select('weight')
      .eq('org_id', orgId)

    const avgWeight =
      weightData && weightData.length > 0
        ? weightData.reduce((sum, row) => sum + (row.weight ?? 0), 0) / weightData.length
        : 0

    // Top 10 nodes by fire_count
    const { data: topNodes } = await supabase
      .from('kg_nodes')
      .select('entity_id, name, fire_count')
      .eq('org_id', orgId)
      .order('fire_count', { ascending: false })
      .limit(10)

    // Hot topics: highest recent fire_count (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: hotTopics } = await supabase
      .from('kg_nodes')
      .select('entity_id, name, activation_level')
      .eq('org_id', orgId)
      .gte('last_fired_at', sevenDaysAgo)
      .order('activation_level', { ascending: false })
      .limit(10)

    return {
      nodeCount: nodeCount ?? 0,
      edgeCount: edgeCount ?? 0,
      avgWeight,
      topNodes: (topNodes ?? []).map(n => ({
        entityId: n.entity_id,
        name: n.name,
        fireCount: n.fire_count,
      })),
      hotTopics: (hotTopics ?? []).map(n => ({
        entityId: n.entity_id,
        name: n.name,
        recentActivation: n.activation_level,
      })),
    }
  } catch (err) {
    logger.error('[neural-engine] getStats failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      nodeCount: 0,
      edgeCount: 0,
      avgWeight: 0,
      topNodes: [],
      hotTopics: [],
    }
  }
}

// ─── Search ──────────────────────────────────────────────────────────────

export async function search(supabase: SupabaseClient, orgId: string, query: string): Promise<NeuralNode[]> {
  try {
    const q = query.toLowerCase().trim()

    // Full-text search on search_tsv
    const { data: ftsResults } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .textSearch('search_tsv', q)
      .limit(20)

    if (ftsResults && ftsResults.length > 0) {
      return ftsResults.map(mapRowToNeuralNode)
    }

    // Fallback: alias search (ILIKE)
    const { data: aliasResults } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('org_id', orgId)
      .ilike('name', `%${q}%`)
      .limit(20)

    return (aliasResults ?? []).map(mapRowToNeuralNode)
  } catch (err) {
    logger.error('[neural-engine] search failed', {
      orgId,
      query,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────

function mapRowToNeuralNode(row: any): NeuralNode {
  return {
    id: row.id,
    entityId: row.entity_id,
    nodeType: row.node_type as NeuralNodeType,
    name: row.name,
    description: row.description ?? null,
    aliases: row.aliases ?? [],
    activationLevel: row.activation_level ?? 0,
    fireCount: row.fire_count ?? 0,
    lastFiredAt: row.last_fired_at ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapRowToSynapse(row: any): Synapse {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    edgeType: row.edge_type as SynapseType,
    weight: row.weight ?? 0,
    fireCount: row.fire_count ?? 0,
    lastFiredAt: row.last_fired_at,
    decayRate: row.decay_rate ?? 0,
  }
}
