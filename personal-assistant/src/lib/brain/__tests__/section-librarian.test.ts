/**
 * Section Librarian — TDD tests.
 *
 * Tests entity resolution, dossier compilation, Hebbian strengthening,
 * and the direct-call entry point.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry, EntityDossier } from '../types'
import type { EntityNode } from '@/lib/knowledge-graph/types'

// Mock dependencies
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((m: string) => m),
}))

vi.mock('@/lib/knowledge-graph/graph-queries', () => ({
  resolveEntityByAlias: vi.fn(),
  hebbianStrengthen: vi.fn(),
}))

vi.mock('../dossier-compiler', () => ({
  compileDossierDelta: vi.fn(),
}))

vi.mock('../worker-infra', () => ({
  createWorker: vi.fn(),
  QUEUE_NAMES: {
    intake: 'memory:intake',
    financial: 'memory:financial',
    relational: 'memory:relational',
    operational: 'memory:operational',
    behavioral: 'memory:behavioral',
    synthesis: 'memory:synthesis',
    crawl: 'memory:crawl',
  },
}))

import { resolveEntityByAlias, hebbianStrengthen } from '@/lib/knowledge-graph/graph-queries'
import { compileDossierDelta } from '../dossier-compiler'
import { processDomainJob, processDomainJobDirect } from '../section-librarian'

const mockedResolveEntity = vi.mocked(resolveEntityByAlias)
const mockedHebbian = vi.mocked(hebbianStrengthen)
const mockedCompile = vi.mocked(compileDossierDelta)

function makeEntityNode(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    id: 'entity-1',
    org_id: 'org-1',
    entity_type: 'person',
    name: 'Alice',
    aliases: ['alice'],
    properties: {},
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    activation_level: 0,
    fire_count: 0,
    last_fired_at: null,
    description: null,
    ...overrides,
  }
}

function makeWALEntry(overrides: Partial<KnowledgeLogEntry> = {}): KnowledgeLogEntry {
  return {
    id: 'wal-1',
    org_id: 'org-1',
    entity_ids: ['entity-abc'],
    signal_type: 'message',
    content: 'Alice paid $500',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeSupabase(opts: {
  walEntries?: KnowledgeLogEntry[]
  currentDossier?: Partial<EntityDossier> | null
  insertEntity?: { id: string; name: string }
} = {}) {
  const walEntries = opts.walEntries ?? [makeWALEntry()]
  const dossier = opts.currentDossier ?? null
  const newEntity = opts.insertEntity ?? { id: 'new-entity-id', name: 'Alice' }

  return {
    from: vi.fn((table: string) => {
      if (table === 'knowledge_log') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: walEntries, error: null }),
          }),
        }
      }
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: dossier, error: null }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'entity_nodes') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: newEntity.id, name: newEntity.name },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('processDomainJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new entity when alias resolution returns null', async () => {
    mockedResolveEntity.mockResolvedValueOnce(null as any)
    mockedCompile.mockResolvedValueOnce({
      markdown: '## Summary\nAlice paid $500',
      token_count: 10,
      model: 'claude-sonnet-4.6',
    })

    const supabase = makeSupabase({
      insertEntity: { id: 'created-id', name: 'Alice' },
    })

    await processDomainJob(supabase as any, {
      org_id: 'org-1',
      entity_name: 'Alice',
      entity_id: 'Alice',
      fact_ids: ['wal-1'],
      domain: 'financial',
      facts: [],
    })

    // Entity node should have been inserted
    expect(supabase.from).toHaveBeenCalledWith('entity_nodes')
    // Dossier should have been compiled
    expect(mockedCompile).toHaveBeenCalled()
  })

  it('uses existing entity when alias resolution succeeds', async () => {
    mockedResolveEntity.mockResolvedValueOnce(makeEntityNode({ id: 'existing-id', name: 'Alice' }))
    mockedCompile.mockResolvedValueOnce({
      markdown: '## Summary\nAlice profile',
      token_count: 15,
      model: 'claude-sonnet-4.6',
    })

    const supabase = makeSupabase()

    await processDomainJob(supabase as any, {
      org_id: 'org-1',
      entity_name: 'Alice',
      entity_id: 'Alice',
      fact_ids: ['wal-1'],
      domain: 'financial',
      facts: [],
    })

    // Should NOT insert into entity_nodes (entity already exists)
    const entityNodesCalls = supabase.from.mock.calls.filter(([t]: [string]) => t === 'entity_nodes')
    expect(entityNodesCalls).toHaveLength(0)
    expect(mockedCompile).toHaveBeenCalled()
  })

  it('returns early when no WAL entries found', async () => {
    mockedResolveEntity.mockResolvedValueOnce(makeEntityNode({ id: 'entity-1', name: 'Alice' }))

    const supabase = makeSupabase({ walEntries: [] })

    await processDomainJob(supabase as any, {
      org_id: 'org-1',
      entity_name: 'Alice',
      entity_id: 'Alice',
      fact_ids: ['nonexistent-id'],
      domain: 'financial',
      facts: [],
    })

    // Should NOT call compile since no entries found
    expect(mockedCompile).not.toHaveBeenCalled()
  })

  it('runs Hebbian strengthening for co-occurring entities', async () => {
    mockedResolveEntity.mockResolvedValueOnce(makeEntityNode({ id: 'alice-id', name: 'Alice' }))
    mockedCompile.mockResolvedValueOnce({
      markdown: '## Summary',
      token_count: 5,
      model: 'claude-sonnet-4.6',
    })

    const walEntry = makeWALEntry({
      entity_ids: ['alice-id', 'bob-id', 'charlie-id'],
    })

    const supabase = makeSupabase({ walEntries: [walEntry] })

    await processDomainJob(supabase as any, {
      org_id: 'org-1',
      entity_name: 'Alice',
      entity_id: 'Alice',
      fact_ids: ['wal-1'],
      domain: 'financial',
      facts: [],
    })

    // Should strengthen edges between Alice and Bob, Alice and Charlie
    expect(mockedHebbian).toHaveBeenCalledTimes(2)
    expect(mockedHebbian).toHaveBeenCalledWith(expect.anything(), 'org-1', 'alice-id', 'bob-id')
    expect(mockedHebbian).toHaveBeenCalledWith(expect.anything(), 'org-1', 'alice-id', 'charlie-id')
  })
})

describe('processDomainJobDirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to processDomainJob with correct parameters', async () => {
    mockedResolveEntity.mockResolvedValueOnce(makeEntityNode({ id: 'entity-1', name: 'Steve' }))
    mockedCompile.mockResolvedValueOnce({
      markdown: '## Summary',
      token_count: 5,
      model: 'claude-sonnet-4.6',
    })

    const supabase = makeSupabase()

    await processDomainJobDirect(supabase as any, 'org-1', 'Steve', ['wal-1'], 'financial')

    expect(mockedResolveEntity).toHaveBeenCalledWith(expect.anything(), 'org-1', 'Steve')
    expect(mockedCompile).toHaveBeenCalled()
  })
})
