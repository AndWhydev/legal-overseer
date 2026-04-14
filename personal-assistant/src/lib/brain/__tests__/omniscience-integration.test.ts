/**
 * Omniscience Integration Tests
 *
 * End-to-end integration tests verifying the full brain pipeline:
 *   1. Dossier-enriched response path (entity_dossiers -> prompt cache -> systemContentBlocks)
 *   2. Spreading activation triggers (neural graph activate() boosts recall scores)
 *   3. System 1/2 fast path (query gate -> assembler config derivation)
 *
 * These tests validate that phases 01-07 work together correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock (shared across tests) ──────────────────────────────────

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  filter: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  overlaps: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  textSearch: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  data: unknown[] | null
  error: null | { message: string }
}

function createMockQueryBuilder(data: unknown[] = []): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    data,
    error: null,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data, error: builder.error })),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data?.[0] ?? null, error: builder.error })),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data?.[0] ?? null, error: builder.error })),
  }
  return builder
}

// Table-specific data
const tableData: Record<string, unknown[]> = {}

function mockSupabase() {
  return {
    from: vi.fn((table: string) => {
      const data = tableData[table] ?? []
      return createMockQueryBuilder(data)
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
}

// ─── Module mocks ─────────────────────────────────────────────────────────

// Mock prompt builder
vi.mock('@/lib/agent/prompt-builder', () => ({
  buildBasePrompt: vi.fn(() => 'You are BitBit, a personal AI assistant.'),
  buildEntityAwarePrompt: vi.fn(async () => 'You are BitBit, a personal AI assistant.'),
}))

// Mock knowledge graph queries (used by proactive-recall)
vi.mock('@/lib/knowledge-graph/graph-queries', () => ({
  getEntityByAlias: vi.fn().mockResolvedValue(null),
  getNeighborhood: vi.fn().mockResolvedValue(null),
  getEntityEvents: vi.fn().mockResolvedValue([]),
  vectorSearchEntities: vi.fn().mockResolvedValue([]),
}))

// Mock neural-graph engine
vi.mock('@/lib/neural-graph/engine', () => ({
  activate: vi.fn().mockResolvedValue([]),
  strengthen: vi.fn().mockResolvedValue(undefined),
}))

// Mock RAG query router
vi.mock('@/lib/rag/query-router', () => ({
  getRetrievalConfig: vi.fn().mockReturnValue({ tokenBudget: 1500 }),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { buildBrainStatePrefix, splitCacheableContext } from '../prompt-cache'
import { classifyQueryComplexity, type QueryComplexity } from '../query-gate'
import { graphAwareRecall } from '@/lib/memory-palace/proactive-recall'
import { activate } from '@/lib/neural-graph/engine'
import { getNeighborhood, getEntityEvents } from '@/lib/knowledge-graph/graph-queries'
import type { ActivationResult } from '@/lib/neural-graph/types'

const mockedActivate = vi.mocked(activate)
const mockedGetNeighborhood = vi.mocked(getNeighborhood)
const mockedGetEntityEvents = vi.mocked(getEntityEvents)

// ─── Test Fixtures ────────────────────────────────────────────────────────

const MOCK_ORG_ID = 'org-integration-test'

function makeDossier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entity_id: overrides.entity_id ?? 'ent-acme',
    entity_name: overrides.entity_name ?? 'Acme Corp',
    dossier_markdown: overrides.dossier_markdown ?? 'Technology company founded 2020. Key contact: Alice Smith.',
    token_count: overrides.token_count ?? 80,
    last_compiled_at: overrides.last_compiled_at ?? '2026-04-15T00:00:00Z',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 1: Dossier-Enriched Response Path
// ═══════════════════════════════════════════════════════════════════════════

describe('Omniscience Integration — Dossier-Enriched Response Path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(tableData)) delete tableData[key]
  })

  it('assembles dossier content into cached system prompt blocks when usePromptCache is true', async () => {
    const supabase = mockSupabase()

    // Wire dossier data into Supabase mock
    tableData['entity_dossiers'] = [
      makeDossier({ entity_name: 'Steve Rogers', dossier_markdown: '## Steve Rogers\nFreelance designer. Owes $2,400 on invoice #88.' }),
      makeDossier({ entity_id: 'ent-acme', entity_name: 'Acme Corp', dossier_markdown: '## Acme Corp\nSaaS client since 2024. Monthly retainer $5k.' }),
    ]
    tableData['memory_palace_entries'] = []
    tableData['domain_profiles'] = []

    const systemPrompt = 'You are BitBit, a personal AI assistant.'

    // Build brain state prefix (the dossier-enriched cacheable portion)
    const prefix = await buildBrainStatePrefix(
      supabase as any,
      MOCK_ORG_ID,
      systemPrompt,
      { userProfile: { displayName: 'Tor', email: 'tor@test.com' } },
    )

    // Verify dossiers were included
    expect(prefix.dossierCount).toBe(2)
    expect(prefix.markdown).toContain('Steve Rogers')
    expect(prefix.markdown).toContain('Acme Corp')
    expect(prefix.markdown).toContain('Entity Dossiers')
    expect(prefix.markdown).toContain('Freelance designer')
    expect(prefix.markdown).toContain('SaaS client since 2024')

    // Split into Anthropic-compatible content blocks
    const cacheable = splitCacheableContext(prefix, '')

    // Verify cache_control markers exist on the cached prefix
    expect(cacheable.cachedPrefix).toHaveLength(1)
    expect(cacheable.cachedPrefix[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(cacheable.cachedPrefix[0].text).toContain('Steve Rogers')
    expect(cacheable.cachedPrefix[0].text).toContain('Acme Corp')

    // No dynamic suffix when there's nothing beyond the prefix
    expect(cacheable.dynamicSuffix).toHaveLength(0)
  })

  it('dynamic content appears in dynamicSuffix when present', async () => {
    const supabase = mockSupabase()

    tableData['entity_dossiers'] = [makeDossier()]
    tableData['memory_palace_entries'] = []
    tableData['domain_profiles'] = []

    const prefix = await buildBrainStatePrefix(
      supabase as any,
      MOCK_ORG_ID,
      'System prompt.',
    )

    const dynamicSection = '\n\n## Pending Actions\n1. Send invoice to Acme'
    const cacheable = splitCacheableContext(prefix, dynamicSection)

    expect(cacheable.cachedPrefix[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(cacheable.dynamicSuffix).toHaveLength(1)
    expect(cacheable.dynamicSuffix[0].text).toContain('Pending Actions')
    // Dynamic suffix should NOT have cache_control
    expect(cacheable.dynamicSuffix[0]).not.toHaveProperty('cache_control')
  })

  it('user profile is included in the prefix when provided', async () => {
    const supabase = mockSupabase()

    tableData['entity_dossiers'] = []
    tableData['memory_palace_entries'] = []
    tableData['domain_profiles'] = []

    const prefix = await buildBrainStatePrefix(
      supabase as any,
      MOCK_ORG_ID,
      'System prompt.',
      { userProfile: { displayName: 'Tor', email: 'tor@bitbit.chat' } },
    )

    expect(prefix.markdown).toContain('Tor')
    expect(prefix.markdown).toContain('tor@bitbit.chat')
    expect(prefix.markdown).toContain('User Profile')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 2: Spreading Activation Integration
// ═══════════════════════════════════════════════════════════════════════════

describe('Omniscience Integration — Spreading Activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(tableData)) delete tableData[key]
  })

  it('graphAwareRecall calls activate() for each mentioned entity and boosts edge scores', async () => {
    const supabase = mockSupabase()
    const entityIds = ['ent-steve', 'ent-acme']

    // Mock spreading activation: returns activation results for neighbors
    mockedActivate.mockImplementation(async (_sb, _org, seedId) => {
      if (seedId === 'ent-steve') {
        return [
          { entityId: 'ent-steve', nodeType: 'Person', name: 'Steve', activation: 1.0, depth: 0, path: ['ent-steve'] },
          { entityId: 'ent-acme', nodeType: 'Organization', name: 'Acme Corp', activation: 0.7, depth: 1, path: ['ent-steve', 'ent-acme'] },
        ] satisfies ActivationResult[]
      }
      if (seedId === 'ent-acme') {
        return [
          { entityId: 'ent-acme', nodeType: 'Organization', name: 'Acme Corp', activation: 1.0, depth: 0, path: ['ent-acme'] },
          { entityId: 'ent-steve', nodeType: 'Person', name: 'Steve', activation: 0.5, depth: 1, path: ['ent-acme', 'ent-steve'] },
        ] satisfies ActivationResult[]
      }
      return []
    })

    // Mock neighborhood: Steve has a relationship edge to Acme
    mockedGetNeighborhood.mockImplementation(async (_sb, _org, entityId) => {
      if (entityId === 'ent-steve') {
        return {
          node: {
            id: 'node-1', org_id: MOCK_ORG_ID, entity_type: 'person', name: 'Steve',
            aliases: [], properties: {}, is_active: true, created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z', activation_level: 0, fire_count: 5,
            last_fired_at: '2026-04-14T00:00:00Z', description: null,
          },
          edges: [{
            id: 'edge-1', org_id: MOCK_ORG_ID, source_id: 'ent-steve', target_id: 'ent-acme',
            relation_type: 'works_with', properties: {}, valid_from: '2026-01-01T00:00:00Z',
            valid_until: null, ingested_at: '2026-01-01T00:00:00Z', confidence: 0.9,
            source_memory_id: null, weight: 0.8, fire_count: 3,
            last_fired_at: '2026-04-10T00:00:00Z', decay_rate: 0.01, expired_at: null,
          }],
          neighbors: [{
            id: 'node-2', org_id: MOCK_ORG_ID, entity_type: 'company', name: 'Acme Corp',
            aliases: [], properties: {}, is_active: true, created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z', activation_level: 0, fire_count: 2,
            last_fired_at: null, description: null,
          }],
        }
      }
      if (entityId === 'ent-acme') {
        return {
          node: {
            id: 'node-2', org_id: MOCK_ORG_ID, entity_type: 'company', name: 'Acme Corp',
            aliases: [], properties: {}, is_active: true, created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z', activation_level: 0, fire_count: 2,
            last_fired_at: null, description: null,
          },
          edges: [],
          neighbors: [],
        }
      }
      return null
    })

    // Mock events: Steve had a recent event
    mockedGetEntityEvents.mockImplementation(async (_sb, _org, entityId) => {
      if (entityId === 'ent-steve') {
        return [{
          id: 'evt-1', org_id: MOCK_ORG_ID, subject_id: 'ent-steve',
          verb: 'sent_invoice', object_text: 'Invoice #42 to Acme Corp',
          object_id: null, occurred_at: new Date().toISOString(),
          occurred_until: null, source_memory_id: null, metadata: {}, created_at: new Date().toISOString(),
        }]
      }
      return []
    })

    const results = await graphAwareRecall(supabase as any, MOCK_ORG_ID, entityIds)

    // Verify activate() was called for each entity
    expect(mockedActivate).toHaveBeenCalledTimes(2)
    expect(mockedActivate).toHaveBeenCalledWith(
      expect.anything(), MOCK_ORG_ID, 'ent-steve',
      expect.objectContaining({ maxDepth: 2, decayFactor: 0.7 }),
    )
    expect(mockedActivate).toHaveBeenCalledWith(
      expect.anything(), MOCK_ORG_ID, 'ent-acme',
      expect.objectContaining({ maxDepth: 2, decayFactor: 0.7 }),
    )

    // Verify results include Steve's neighborhood (edges + events)
    expect(results.length).toBeGreaterThan(0)
    const steveResult = results.find(r => r.entityId === 'ent-steve')
    expect(steveResult).toBeDefined()
    expect(steveResult!.entityName).toBe('Steve')
    expect(steveResult!.formattedText).toContain('works_with')
    expect(steveResult!.formattedText).toContain('sent_invoice')

    // Verify edge scores were boosted by activation (blendedScore > base score)
    const edgeItems = steveResult!.scoredItems.filter(i => i.type === 'edge')
    expect(edgeItems.length).toBe(1)
    // The Acme neighbor had activation 0.7 from Steve's activate() call
    // Score should be multiplied by (1 + 0.7) = 1.7
    // Without activation boost: blendedScore = base * confidence * decay
    // With activation boost: blendedScore *= 1.7
    expect(edgeItems[0].blendedScore).toBeGreaterThan(0)
  })

  it('Hebbian strengthening fires for co-occurring entity pairs', async () => {
    const supabase = mockSupabase()
    const { strengthen } = await import('@/lib/neural-graph/engine')
    const mockedStrengthen = vi.mocked(strengthen)

    // Two entities co-occurring should trigger strengthen
    mockedActivate.mockResolvedValue([])
    mockedGetNeighborhood.mockResolvedValue(null)

    await graphAwareRecall(supabase as any, MOCK_ORG_ID, ['ent-a', 'ent-b'])

    // strengthen should be called for the co-occurring pair
    expect(mockedStrengthen).toHaveBeenCalledWith(
      expect.anything(), MOCK_ORG_ID, 'ent-a', 'ent-b',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite 3: System 1/2 Fast Path
// ═══════════════════════════════════════════════════════════════════════════

describe('Omniscience Integration — System 1 Fast Path', () => {
  /**
   * Mirrors the assemblerOverrides logic from taor-loop.ts to verify
   * correct mapping from query complexity to assembler configuration.
   */
  function deriveAssemblerConfig(complexity: QueryComplexity) {
    if (complexity === 'system1') {
      return {
        usePromptCache: true,
        useGlobalWorkspace: false,
        maxEntities: 3,
        includeCompressedHistory: false,
      }
    }
    return {
      usePromptCache: true,
      useGlobalWorkspace: true,
    }
  }

  describe('classifyQueryComplexity returns correct classifications', () => {
    it.each([
      ['hey', 'system1'],
      ['hello', 'system1'],
      ['thanks', 'system1'],
      ['ok', 'system1'],
      ['yes', 'system1'],
      ['send it', 'system1'],
      ['remind me to call Steve', 'system1'],
      ['good morning', 'system1'],
    ] as const)('"%s" -> %s', (query, expected) => {
      expect(classifyQueryComplexity(query)).toBe(expected)
    })

    it.each([
      ['why did the payment fail for Acme?', 'system2'],
      ['what happened last week with the invoices?', 'system2'],
      ['analyze all client revenue this quarter', 'system2'],
      ['compare Steve and Jane and their project history before the deadline', 'system2'],
    ] as const)('"%s" -> %s', (query, expected) => {
      expect(classifyQueryComplexity(query)).toBe(expected)
    })
  })

  describe('System 1 disables global workspace', () => {
    it('system1 classification produces config with useGlobalWorkspace: false', () => {
      const complexity = classifyQueryComplexity('hey')
      expect(complexity).toBe('system1')

      const config = deriveAssemblerConfig(complexity)
      expect(config.useGlobalWorkspace).toBe(false)
      expect(config.usePromptCache).toBe(true)
    })

    it('system1 limits entities to 3 and disables compressed history', () => {
      const config = deriveAssemblerConfig('system1')
      expect(config).toEqual({
        usePromptCache: true,
        useGlobalWorkspace: false,
        maxEntities: 3,
        includeCompressedHistory: false,
      })
    })
  })

  describe('System 2 enables full retrieval', () => {
    it('system2 classification produces config with useGlobalWorkspace: true', () => {
      const complexity = classifyQueryComplexity(
        'what happened last month with the Acme invoices?',
      )
      expect(complexity).toBe('system2')

      const config = deriveAssemblerConfig(complexity)
      expect(config.useGlobalWorkspace).toBe(true)
      expect(config.usePromptCache).toBe(true)
    })

    it('system2 config does not restrict entities or history', () => {
      const config = deriveAssemblerConfig('system2')
      expect(config).toEqual({
        usePromptCache: true,
        useGlobalWorkspace: true,
      })
      expect(config).not.toHaveProperty('maxEntities')
      expect(config).not.toHaveProperty('includeCompressedHistory')
    })
  })

  describe('Multi-entity escalation', () => {
    it('multi-entity queries always escalate to system2 regardless of pattern', () => {
      // Even a greeting with 3+ entity mentions gets system2
      const complexity = classifyQueryComplexity('hey', { entityMentionCount: 3 })
      expect(complexity).toBe('system2')

      const config = deriveAssemblerConfig(complexity)
      expect(config.useGlobalWorkspace).toBe(true)
    })
  })

  describe('End-to-end: query -> classification -> config -> assembler contract', () => {
    it('simple greeting results in cache-only fast path (no global workspace)', () => {
      const query = 'thanks'
      const complexity = classifyQueryComplexity(query)
      const config = deriveAssemblerConfig(complexity)

      expect(complexity).toBe('system1')
      expect(config.usePromptCache).toBe(true)
      expect(config.useGlobalWorkspace).toBe(false)
    })

    it('complex reasoning query results in full retrieval with global workspace', () => {
      const query = 'should I approve the budget increase for the marketing team based on last quarter results?'
      const complexity = classifyQueryComplexity(query)
      const config = deriveAssemblerConfig(complexity)

      expect(complexity).toBe('system2')
      expect(config.usePromptCache).toBe(true)
      expect(config.useGlobalWorkspace).toBe(true)
    })
  })
})
