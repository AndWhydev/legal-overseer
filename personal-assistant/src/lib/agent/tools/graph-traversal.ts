// src/lib/agent/tools/graph-traversal.ts

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getEntityByAlias,
  getMultiHopNeighborhood,
  getEntityEvents,
} from '@/lib/knowledge-graph/graph-queries'
import type { AgentToolHandler } from '../tools'
import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TraverseGraphResult {
  entity: {
    id: string
    name: string
    type: string
    properties: Record<string, unknown>
  }
  directRelationships: Array<{
    targetName: string
    targetType: string
    relationType: string
    since: string
    confidence: number
  }>
  secondOrderConnections: Array<{
    name: string
    type: string
    connectedVia: string
    relationType: string
  }>
  activeCommunities: Array<{
    name: string
    summary: string
    memberCount: number
  }>
  recentEvents: Array<{
    verb: string
    objectText: string | null
    occurredAt: string
  }>
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export const graphTraversalToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'traverse_graph',
    description:
      'Traverse the knowledge graph from a named entity to discover relationships, second-order connections, active communities, and recent events. Use this when the user asks about relationships between people/projects/companies, or when you need relational context that memory search cannot provide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_name: {
          type: 'string',
          description:
            'Name of the entity to start traversal from. Supports fuzzy matching via aliases.',
        },
        depth: {
          type: 'number',
          description:
            'How many hops to traverse (1-3). Default 1. Use 2+ for second-order connections.',
          minimum: 1,
          maximum: 3,
        },
      },
      required: ['entity_name'],
    },
  },
]

// ─── Tool Handler ───────────────────────────────────────────────────────────

async function handleTraverseGraph(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ success: boolean; data?: TraverseGraphResult; error?: string }> {
  const entityName = input.entity_name as string
  const depth = Math.min(Math.max((input.depth as number) ?? 1, 1), 3)

  if (!entityName) {
    return { success: false, error: 'entity_name is required' }
  }

  try {
    // 1. Resolve entity by alias/name
    const entity = await getEntityByAlias(supabase, orgId, entityName)
    if (!entity) {
      return {
        success: false,
        error: `Entity "${entityName}" not found. Try a different name or alias.`,
      }
    }

    // 2. Multi-hop neighborhood traversal
    const { nodes, edges } = await getMultiHopNeighborhood(
      supabase,
      orgId,
      entity.id,
      depth,
    )

    // Build name map for edge resolution
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Direct relationships (1-hop edges involving the root entity)
    const directRelationships: TraverseGraphResult['directRelationships'] = []
    const directNeighborIds = new Set<string>()

    for (const edge of edges) {
      const isSource = edge.source_id === entity.id
      const isTarget = edge.target_id === entity.id
      if (!isSource && !isTarget) continue

      const targetId = isSource ? edge.target_id : edge.source_id
      const targetNode = nodeMap.get(targetId)
      if (!targetNode) continue

      directNeighborIds.add(targetId)
      directRelationships.push({
        targetName: targetNode.name,
        targetType: targetNode.entity_type,
        relationType: edge.relation_type,
        since: edge.valid_from?.slice(0, 10) ?? 'unknown',
        confidence: edge.confidence,
      })
    }

    // Second-order connections (edges NOT involving root, via intermediary)
    const secondOrderConnections: TraverseGraphResult['secondOrderConnections'] = []
    if (depth >= 2) {
      for (const edge of edges) {
        if (edge.source_id === entity.id || edge.target_id === entity.id) continue

        // Determine the intermediary (must be a direct neighbor)
        let intermediaryId: string | null = null
        let farEndId: string | null = null

        if (directNeighborIds.has(edge.source_id)) {
          intermediaryId = edge.source_id
          farEndId = edge.target_id
        } else if (directNeighborIds.has(edge.target_id)) {
          intermediaryId = edge.target_id
          farEndId = edge.source_id
        }

        if (!intermediaryId || !farEndId) continue
        if (farEndId === entity.id) continue

        const farNode = nodeMap.get(farEndId)
        const intermediary = nodeMap.get(intermediaryId)
        if (!farNode || !intermediary) continue

        secondOrderConnections.push({
          name: farNode.name,
          type: farNode.entity_type,
          connectedVia: intermediary.name,
          relationType: edge.relation_type,
        })
      }
    }

    // 3. Active communities via member_of edges
    const activeCommunities: TraverseGraphResult['activeCommunities'] = []
    const { data: communityEdges } = await supabase
      .from('entity_edges')
      .select('target_id')
      .eq('org_id', orgId)
      .eq('source_id', entity.id)
      .eq('relation_type', 'member_of')
      .is('valid_until', null)

    if (communityEdges) {
      for (const ce of communityEdges) {
        const { data: community } = await supabase
          .from('entity_nodes')
          .select('name, properties')
          .eq('id', ce.target_id)
          .eq('entity_type', 'community')
          .eq('is_active', true)
          .single()

        if (community) {
          const props = community.properties as Record<string, unknown>
          activeCommunities.push({
            name: community.name,
            summary: (props.summary as string) ?? '',
            memberCount: (props.member_count as number) ?? 0,
          })
        }
      }
    }

    // 4. Recent events (past 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const events = await getEntityEvents(supabase, orgId, entity.id, {
      from: thirtyDaysAgo,
    })

    const recentEvents: TraverseGraphResult['recentEvents'] = events
      .slice(0, 20)
      .map(e => ({
        verb: e.verb,
        objectText: e.object_text,
        occurredAt: e.occurred_at,
      }))

    // 5. Format result
    const result: TraverseGraphResult = {
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.entity_type,
        properties: entity.properties,
      },
      directRelationships,
      secondOrderConnections: secondOrderConnections.slice(0, 20),
      activeCommunities,
      recentEvents,
    }

    return { success: true, data: result }
  } catch (err) {
    logger.error('[traverse_graph] Unexpected error', {
      error: err instanceof Error ? err.message : String(err),
      entityName,
    })
    return { success: false, error: `Graph traversal failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const graphTraversalToolHandlers: Record<string, AgentToolHandler> = {
  traverse_graph: handleTraverseGraph,
}
