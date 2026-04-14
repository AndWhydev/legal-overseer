/**
 * Tests for spreading activation integration in proactive recall.
 * Verifies: activate() called per entity, activation boosts scores, strengthen() called for co-occurring pairs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActivationResult } from '@/lib/neural-graph/types'

// Mock neural-graph engine
vi.mock('@/lib/neural-graph/engine', () => ({
  activate: vi.fn(),
  strengthen: vi.fn(),
}))

// Mock graph-queries
vi.mock('@/lib/knowledge-graph/graph-queries', () => ({
  getNeighborhood: vi.fn(),
  getEntityEvents: vi.fn(),
  vectorSearchEntities: vi.fn(),
}))

// Mock RAG config
vi.mock('@/lib/rag/query-router', () => ({
  getRetrievalConfig: () => ({ tokenBudget: 1500 }),
}))

// Mock logger
vi.mock('@/lib/core/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { activate, strengthen } from '@/lib/neural-graph/engine'
import { getNeighborhood, getEntityEvents } from '@/lib/knowledge-graph/graph-queries'
import { graphAwareRecall } from '../proactive-recall'

const mockSupabase = {} as any

function makeNeighborhood(entityId: string, entityName: string, edges: any[] = [], neighbors: any[] = []) {
  return {
    node: {
      id: entityId,
      org_id: 'org1',
      entity_type: 'person' as const,
      name: entityName,
      aliases: [],
      properties: {},
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      activation_level: 0,
      fire_count: 0,
      last_fired_at: null,
      description: null,
    },
    edges,
    neighbors,
  }
}

function makeActivationResult(entityId: string, name: string, activation: number, depth: number): ActivationResult {
  return { entityId, nodeType: 'Person', name, activation, depth, path: [entityId] }
}

describe('spreading-activation integration in graphAwareRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEntityEvents).mockResolvedValue([])
  })

  it('calls activate() for each mentioned entity', async () => {
    vi.mocked(activate).mockResolvedValue([])
    vi.mocked(getNeighborhood).mockResolvedValue(
      makeNeighborhood('e1', 'Alice')
    )

    await graphAwareRecall(mockSupabase, 'org1', ['e1', 'e2'])

    expect(activate).toHaveBeenCalledWith(mockSupabase, 'org1', 'e1', { maxDepth: 2, decayFactor: 0.7 })
    expect(activate).toHaveBeenCalledWith(mockSupabase, 'org1', 'e2', { maxDepth: 2, decayFactor: 0.7 })
  })

  it('boosts scores for entities appearing in activation results', async () => {
    // Entity e1 has a neighbor e-neighbor via edge
    const edge = {
      id: 'edge1',
      source_id: 'e1',
      target_id: 'e-neighbor',
      relation_type: 'WORKS_WITH',
      confidence: 0.8,
      valid_from: new Date().toISOString(),
      properties: {},
      weight: 0.5,
      fire_count: 0,
      last_fired_at: new Date().toISOString(),
      decay_rate: 0,
      expired_at: null,
    }

    vi.mocked(getNeighborhood).mockResolvedValue(
      makeNeighborhood('e1', 'Alice', [edge], [{ id: 'e-neighbor', name: 'Bob' }])
    )

    // First call: no activation (baseline)
    vi.mocked(activate).mockResolvedValue([])
    const baselineResults = await graphAwareRecall(mockSupabase, 'org1', ['e1'])
    const baselineScore = baselineResults[0]?.scoredItems[0]?.blendedScore ?? 0

    vi.clearAllMocks()
    vi.mocked(getEntityEvents).mockResolvedValue([])
    vi.mocked(getNeighborhood).mockResolvedValue(
      makeNeighborhood('e1', 'Alice', [edge], [{ id: 'e-neighbor', name: 'Bob' }])
    )

    // Second call: activation boosts e-neighbor
    vi.mocked(activate).mockResolvedValue([
      makeActivationResult('e-neighbor', 'Bob', 0.6, 1),
    ])
    const boostedResults = await graphAwareRecall(mockSupabase, 'org1', ['e1'])
    const boostedScore = boostedResults[0]?.scoredItems[0]?.blendedScore ?? 0

    // Boosted score should be higher (multiplied by 1 + 0.6 = 1.6)
    expect(boostedScore).toBeGreaterThan(baselineScore)
  })

  it('calls strengthen() for co-occurring entity pairs (fire-and-forget)', async () => {
    vi.mocked(activate).mockResolvedValue([])
    vi.mocked(getNeighborhood).mockResolvedValue(
      makeNeighborhood('e1', 'Alice')
    )

    await graphAwareRecall(mockSupabase, 'org1', ['e1', 'e2', 'e3'])

    // Should be called for all unique pairs: (e1,e2), (e1,e3), (e2,e3)
    expect(strengthen).toHaveBeenCalledWith(mockSupabase, 'org1', 'e1', 'e2')
    expect(strengthen).toHaveBeenCalledWith(mockSupabase, 'org1', 'e1', 'e3')
    expect(strengthen).toHaveBeenCalledWith(mockSupabase, 'org1', 'e2', 'e3')
  })

  it('gracefully handles activate() errors without blocking recall', async () => {
    vi.mocked(activate).mockRejectedValue(new Error('RPC timeout'))
    vi.mocked(getNeighborhood).mockResolvedValue(
      makeNeighborhood('e1', 'Alice')
    )

    // Should not throw
    const results = await graphAwareRecall(mockSupabase, 'org1', ['e1'])
    // Results may be empty (no edges) but should not crash
    expect(results).toBeDefined()
  })
})
