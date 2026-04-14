/**
 * Neural Decay — Tests that decay signals (confidence, decay_rate, last_fired_at)
 * affect recall scoring in proactive-recall.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the exported scoreEdge-like logic indirectly via graphAwareRecall,
// but since scoreEdge is module-private we test via the exported helpers.
// Instead, we import the internal scoring helpers by re-exporting them for test.

// The simplest approach: import the module and test the scoring functions.
// scoreEdge is not exported, so we test via graphAwareRecall with mocked dependencies.

vi.mock('@/lib/knowledge-graph/graph-queries', () => ({
  getNeighborhood: vi.fn(),
  getEntityEvents: vi.fn().mockResolvedValue([]),
  vectorSearchEntities: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/neural-graph/engine', () => ({
  activate: vi.fn().mockResolvedValue([]),
  strengthen: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/rag/query-router', () => ({
  getRetrievalConfig: () => ({ tokenBudget: 1500 }),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { graphAwareRecall } from '../proactive-recall'
import { getNeighborhood } from '@/lib/knowledge-graph/graph-queries'
import type { GraphNeighborhood, EntityEdge, EntityNode } from '@/lib/knowledge-graph/types'

const mockSupabase = {} as any

function makeNode(id: string, name: string): EntityNode {
  return {
    id,
    org_id: 'org-1',
    entity_type: 'person',
    name,
    aliases: [],
    properties: {},
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    activation_level: 0,
    fire_count: 0,
    last_fired_at: null,
    description: null,
  }
}

function makeEdge(
  source_id: string,
  target_id: string,
  overrides: Partial<EntityEdge> = {},
): EntityEdge {
  return {
    id: `edge-${source_id}-${target_id}`,
    org_id: 'org-1',
    source_id,
    target_id,
    relation_type: 'knows',
    properties: {},
    valid_from: new Date().toISOString(),
    valid_until: null,
    ingested_at: new Date().toISOString(),
    confidence: 1.0,
    source_memory_id: null,
    weight: 1.0,
    fire_count: 1,
    last_fired_at: new Date().toISOString(),
    decay_rate: 0.01,
    expired_at: null,
    ...overrides,
  }
}

describe('Neural Decay in Recall Scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('high-confidence recent edges score higher than low-confidence old edges', async () => {
    const nodeA = makeNode('a', 'Alice')
    const nodeB = makeNode('b', 'Bob')
    const nodeC = makeNode('c', 'Charlie')

    // High confidence, recently fired
    const freshEdge = makeEdge('a', 'b', {
      confidence: 0.95,
      decay_rate: 0.01,
      last_fired_at: new Date().toISOString(), // just now
    })

    // Low confidence, fired 60 days ago
    const staleEdge = makeEdge('a', 'c', {
      confidence: 0.2,
      decay_rate: 0.05,
      last_fired_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    })

    const neighborhood: GraphNeighborhood = {
      node: nodeA,
      edges: [freshEdge, staleEdge],
      neighbors: [nodeB, nodeC],
    }

    vi.mocked(getNeighborhood).mockResolvedValue(neighborhood)

    const results = await graphAwareRecall(mockSupabase, 'org-1', ['a'])
    expect(results.length).toBe(1)

    const items = results[0].scoredItems
    expect(items.length).toBe(2)

    // Fresh high-confidence edge should rank first
    const freshItem = items.find(i => i.description.includes('Bob'))!
    const staleItem = items.find(i => i.description.includes('Charlie'))!
    expect(freshItem).toBeDefined()
    expect(staleItem).toBeDefined()
    expect(freshItem.blendedScore).toBeGreaterThan(staleItem.blendedScore)
  })

  it('two identical entities with different decay rates produce different scores', async () => {
    const nodeA = makeNode('a', 'Alice')
    const nodeB = makeNode('b', 'Bob')
    const nodeC = makeNode('c', 'Charlie')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    // Same confidence, same last_fired_at, but different decay rates
    const slowDecayEdge = makeEdge('a', 'b', {
      confidence: 0.8,
      decay_rate: 0.01, // slow decay
      last_fired_at: thirtyDaysAgo,
    })

    const fastDecayEdge = makeEdge('a', 'c', {
      confidence: 0.8,
      decay_rate: 0.1, // fast decay
      last_fired_at: thirtyDaysAgo,
    })

    const neighborhood: GraphNeighborhood = {
      node: nodeA,
      edges: [slowDecayEdge, fastDecayEdge],
      neighbors: [nodeB, nodeC],
    }

    vi.mocked(getNeighborhood).mockResolvedValue(neighborhood)

    const results = await graphAwareRecall(mockSupabase, 'org-1', ['a'])
    const items = results[0].scoredItems

    const slowItem = items.find(i => i.description.includes('Bob'))!
    const fastItem = items.find(i => i.description.includes('Charlie'))!

    // Slow decay should score higher than fast decay (less penalty)
    expect(slowItem.blendedScore).toBeGreaterThan(fastItem.blendedScore)
  })

  it('null last_fired_at defaults to no penalty', async () => {
    const nodeA = makeNode('a', 'Alice')
    const nodeB = makeNode('b', 'Bob')
    const nodeC = makeNode('c', 'Charlie')

    // Edge with null last_fired_at — should get multiplier of 1.0
    const nullFiredEdge = makeEdge('a', 'b', {
      confidence: 0.8,
      decay_rate: 0.05,
      last_fired_at: null as any, // null = no penalty
    })

    // Edge fired 90 days ago — should get heavy penalty
    const oldFiredEdge = makeEdge('a', 'c', {
      confidence: 0.8,
      decay_rate: 0.05,
      last_fired_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    })

    const neighborhood: GraphNeighborhood = {
      node: nodeA,
      edges: [nullFiredEdge, oldFiredEdge],
      neighbors: [nodeB, nodeC],
    }

    vi.mocked(getNeighborhood).mockResolvedValue(neighborhood)

    const results = await graphAwareRecall(mockSupabase, 'org-1', ['a'])
    const items = results[0].scoredItems

    const nullItem = items.find(i => i.description.includes('Bob'))!
    const oldItem = items.find(i => i.description.includes('Charlie'))!

    // Null last_fired_at (no penalty) should score >= old fired edge
    expect(nullItem.blendedScore).toBeGreaterThan(oldItem.blendedScore)
  })
})
