/**
 * Chief Librarian — TDD tests.
 *
 * Tests computeDossierHash, domain profile synthesis with Merkle-tree
 * change detection, morning briefing generation, and worker startup.
 * LLM-dependent functions are tested with mocked generateText calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

import type { EntityDossier, DomainProfile, DomainType } from '../types'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

// Mock worker-infra to avoid Redis connections
vi.mock('../worker-infra', () => ({
  createWorker: vi.fn((_queueName: string, _processor: unknown, _opts?: unknown) => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  QUEUE_NAMES: {
    intake: 'memory:intake',
    financial: 'memory:financial',
    relational: 'memory:relational',
    operational: 'memory:operational',
    behavioral: 'memory:behavioral',
    synthesis: 'memory:synthesis',
  },
}))

import { generateText } from 'ai'
import { createWorker, QUEUE_NAMES } from '../worker-infra'
import {
  computeDossierHash,
  synthesizeDomainProfile,
  generateMorningBriefing,
  startChiefLibrarian,
  MAX_PROFILE_TOKENS,
} from '../chief-librarian'

const mockedGenerateText = vi.mocked(generateText)
const mockedCreateWorker = vi.mocked(createWorker)

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDossier(overrides: Partial<EntityDossier> = {}): EntityDossier {
  return {
    id: 'dossier-1',
    org_id: 'org-1',
    entity_id: 'entity-1',
    entity_name: 'Alice',
    dossier_markdown: '## Summary\nAlice is a regular client.\n\n## Key Facts\n- Pays invoices on time\n',
    schema_json: {},
    version: 1,
    last_compiled_at: new Date().toISOString(),
    stale_since: null,
    token_count: 50,
    facts_incorporated: 3,
    last_fact_id: 'fact-0',
    compilation_model: 'anthropic/claude-sonnet-4.6',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeDomainProfile(overrides: Partial<DomainProfile> = {}): DomainProfile {
  return {
    id: 'profile-1',
    org_id: 'org-1',
    domain: 'financial' as DomainType,
    profile_markdown: '## Overview\nFinancial overview.\n\n## Key Entities\n- Alice\n\n## Trends\n- Stable payments\n\n## Risks\n- None',
    constituent_hashes: {},
    version: 1,
    last_compiled_at: new Date().toISOString(),
    token_count: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a mock Supabase client with chainable query builder.
 */
function createMockSupabase() {
  const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}

  const chainable = () => {
    const chain: any = {}
    const methods = ['select', 'eq', 'in', 'single', 'insert', 'upsert', 'update']
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain)
    }
    // Default resolution
    chain._resolve = { data: null, error: null }
    // Override the last method to return the resolved value
    chain.then = (resolve: any) => resolve(chain._resolve)
    return chain
  }

  // Track calls per table
  const tableChains: Record<string, any[]> = {}

  const from = vi.fn().mockImplementation((table: string) => {
    if (!tableChains[table]) tableChains[table] = []
    const chain = chainable()
    tableChains[table].push(chain)
    return chain
  })

  return {
    from,
    _tableChains: tableChains,
    _setResponse(table: string, callIndex: number, response: { data: any; error: any }) {
      // Pre-create chain entries if needed
      if (!tableChains[table]) tableChains[table] = []
      // We'll set up the response via the from mock
    },
  }
}

// ─── computeDossierHash ────────────────────────────────────────────────────

describe('computeDossierHash', () => {
  it('produces a consistent SHA-256 hex string', () => {
    const input = '## Summary\nAlice is a client.'
    const expected = createHash('sha256').update(input).digest('hex')

    const result = computeDossierHash(input)

    expect(result).toBe(expected)
    expect(result).toHaveLength(64) // SHA-256 hex is always 64 chars
  })

  it('returns the same hash for the same input', () => {
    const input = 'Some markdown content'
    const hash1 = computeDossierHash(input)
    const hash2 = computeDossierHash(input)

    expect(hash1).toBe(hash2)
  })

  it('returns different hashes for different inputs', () => {
    const hash1 = computeDossierHash('content A')
    const hash2 = computeDossierHash('content B')

    expect(hash1).not.toBe(hash2)
  })

  it('produces valid hex characters only', () => {
    const result = computeDossierHash('test input')
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles empty string', () => {
    const expected = createHash('sha256').update('').digest('hex')
    expect(computeDossierHash('')).toBe(expected)
  })
})

// ─── synthesizeDomainProfile ───────────────────────────────────────────────

describe('synthesizeDomainProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips re-synthesis when all constituent hashes match', async () => {
    const dossier1 = makeDossier({ entity_id: 'e1', dossier_markdown: 'content-1' })
    const dossier2 = makeDossier({ entity_id: 'e2', dossier_markdown: 'content-2' })

    const existingHashes: Record<string, string> = {
      e1: computeDossierHash('content-1'),
      e2: computeDossierHash('content-2'),
    }

    const existingProfile = makeDomainProfile({
      constituent_hashes: existingHashes,
      version: 2,
    })

    // Build mock supabase that returns correct responses
    const selectDossiers = vi.fn().mockReturnValue({ data: [dossier1, dossier2], error: null })
    const selectProfile = vi.fn().mockReturnValue({ data: existingProfile, error: null })

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => selectDossiers()),
          }),
        }
      }
      if (table === 'domain_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(() => selectProfile()),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const supabase = { from: fromMock } as any

    const result = await synthesizeDomainProfile(supabase, 'org-1', 'financial')

    expect(result.updated).toBe(false)
    // Should NOT call generateText when hashes match
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('re-synthesizes when dossier hashes differ from stored hashes', async () => {
    const dossier1 = makeDossier({ entity_id: 'e1', dossier_markdown: 'updated-content' })

    const existingHashes: Record<string, string> = {
      e1: computeDossierHash('old-content'), // different from current
    }

    const existingProfile = makeDomainProfile({
      constituent_hashes: existingHashes,
      version: 1,
    })

    const generatedMarkdown = '## Overview\nUpdated financial overview.\n\n## Key Entities\n- Alice\n\n## Trends\n- Payment patterns changed\n\n## Risks\n- Monitor closely'

    mockedGenerateText.mockResolvedValueOnce({
      text: generatedMarkdown,
    } as any)

    // Mock supabase: entity_dossiers select, domain_profiles select, domain_profiles upsert
    const upsertMock = vi.fn().mockReturnValue({ error: null })
    let fromCallCount = 0

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [dossier1], error: null }),
          }),
        }
      }
      if (table === 'domain_profiles') {
        fromCallCount++
        if (fromCallCount === 1) {
          // First call: select existing profile
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue({ data: existingProfile, error: null }),
                }),
              }),
            }),
          }
        }
        // Second call: upsert
        return { upsert: upsertMock }
      }
      return {}
    })

    const supabase = { from: fromMock } as any

    const result = await synthesizeDomainProfile(supabase, 'org-1', 'financial')

    expect(result.updated).toBe(true)
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)
    expect(upsertMock).toHaveBeenCalledTimes(1)

    // Verify the upsert payload
    const upsertPayload = upsertMock.mock.calls[0][0]
    expect(upsertPayload.profile_markdown).toBe(generatedMarkdown)
    expect(upsertPayload.version).toBe(2) // incremented from 1
    expect(upsertPayload.constituent_hashes.e1).toBe(computeDossierHash('updated-content'))
  })

  it('creates a new profile when none exists', async () => {
    const dossier1 = makeDossier({ entity_id: 'e1', dossier_markdown: 'content-1' })

    const generatedMarkdown = '## Overview\nNew financial profile.\n\n## Key Entities\n- Alice\n\n## Trends\n- None yet\n\n## Risks\n- None'

    mockedGenerateText.mockResolvedValueOnce({
      text: generatedMarkdown,
    } as any)

    const upsertMock = vi.fn().mockReturnValue({ error: null })
    let domainProfileCallCount = 0

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [dossier1], error: null }),
          }),
        }
      }
      if (table === 'domain_profiles') {
        domainProfileCallCount++
        if (domainProfileCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue({ data: null, error: { code: 'PGRST116' } }),
                }),
              }),
            }),
          }
        }
        return { upsert: upsertMock }
      }
      return {}
    })

    const supabase = { from: fromMock } as any

    const result = await synthesizeDomainProfile(supabase, 'org-1', 'financial')

    expect(result.updated).toBe(true)
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)

    const upsertPayload = upsertMock.mock.calls[0][0]
    expect(upsertPayload.version).toBe(1) // first version
    expect(upsertPayload.domain).toBe('financial')
  })

  it('uses the balanced model (Sonnet) for synthesis', async () => {
    const dossier1 = makeDossier({ entity_id: 'e1', dossier_markdown: 'content-1' })

    mockedGenerateText.mockResolvedValueOnce({
      text: '## Overview\nTest',
    } as any)

    let domainProfileCallCount = 0
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [dossier1], error: null }),
          }),
        }
      }
      if (table === 'domain_profiles') {
        domainProfileCallCount++
        if (domainProfileCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue({ data: null, error: { code: 'PGRST116' } }),
                }),
              }),
            }),
          }
        }
        return { upsert: vi.fn().mockReturnValue({ error: null }) }
      }
      return {}
    })

    const supabase = { from: fromMock } as any
    await synthesizeDomainProfile(supabase, 'org-1', 'financial')

    const callArgs = mockedGenerateText.mock.calls[0][0] as any
    expect(callArgs.model).toBe('anthropic/claude-sonnet-4.6')
  })

  it('requests the correct output sections in system prompt', async () => {
    const dossier1 = makeDossier({ entity_id: 'e1', dossier_markdown: 'content-1' })

    mockedGenerateText.mockResolvedValueOnce({
      text: '## Overview\nTest',
    } as any)

    let domainProfileCallCount = 0
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [dossier1], error: null }),
          }),
        }
      }
      if (table === 'domain_profiles') {
        domainProfileCallCount++
        if (domainProfileCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue({ data: null, error: { code: 'PGRST116' } }),
                }),
              }),
            }),
          }
        }
        return { upsert: vi.fn().mockReturnValue({ error: null }) }
      }
      return {}
    })

    const supabase = { from: fromMock } as any
    await synthesizeDomainProfile(supabase, 'org-1', 'financial')

    const callArgs = mockedGenerateText.mock.calls[0][0] as any
    expect(callArgs.system).toContain('## Overview')
    expect(callArgs.system).toContain('## Key Entities')
    expect(callArgs.system).toContain('## Trends')
    expect(callArgs.system).toContain('## Risks')
  })
})

// ─── generateMorningBriefing ───────────────────────────────────────────────

describe('generateMorningBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads all 4 domain profiles and synthesizes a briefing', async () => {
    const profiles = [
      makeDomainProfile({ domain: 'financial', profile_markdown: '## Overview\nFinancial data' }),
      makeDomainProfile({ domain: 'relational', profile_markdown: '## Overview\nRelational data' }),
      makeDomainProfile({ domain: 'operational', profile_markdown: '## Overview\nOperational data' }),
      makeDomainProfile({ domain: 'behavioral', profile_markdown: '## Overview\nBehavioral data' }),
    ]

    const briefingText = '# Morning Briefing\n\n## Top 5 Priorities\n1. Follow up with Alice\n2. Review invoices\n3. Check calendar\n4. Respond to Bob\n5. Update project plan\n\n## Upcoming Deadlines & Risks\n- Invoice due Friday\n\n## New Discoveries\n- Alice changed payment method'

    mockedGenerateText.mockResolvedValueOnce({
      text: briefingText,
    } as any)

    const insertMock = vi.fn().mockReturnValue({ error: null })

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'domain_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: profiles, error: null }),
          }),
        }
      }
      if (table === 'memory_palace_entries') {
        return { insert: insertMock }
      }
      return {}
    })

    const supabase = { from: fromMock } as any

    const result = await generateMorningBriefing(supabase, 'org-1')

    expect(result).toBe(briefingText)
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)

    // Verify it stores the briefing as a memory_palace_entry
    expect(insertMock).toHaveBeenCalledTimes(1)
    const insertPayload = insertMock.mock.calls[0][0]
    expect(insertPayload.category).toBe('pattern')
    expect(insertPayload.source).toBe('consolidation')
    expect(insertPayload.org_id).toBe('org-1')
  })

  it('includes all domain profiles in the LLM prompt', async () => {
    const profiles = [
      makeDomainProfile({ domain: 'financial', profile_markdown: 'FINANCIAL_CONTENT' }),
      makeDomainProfile({ domain: 'relational', profile_markdown: 'RELATIONAL_CONTENT' }),
    ]

    mockedGenerateText.mockResolvedValueOnce({
      text: '# Briefing\nTest',
    } as any)

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'domain_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: profiles, error: null }),
          }),
        }
      }
      if (table === 'memory_palace_entries') {
        return { insert: vi.fn().mockReturnValue({ error: null }) }
      }
      return {}
    })

    const supabase = { from: fromMock } as any
    await generateMorningBriefing(supabase, 'org-1')

    const callArgs = mockedGenerateText.mock.calls[0][0] as any
    expect(callArgs.prompt).toContain('FINANCIAL_CONTENT')
    expect(callArgs.prompt).toContain('RELATIONAL_CONTENT')
  })

  it('requests priorities, deadlines, and discoveries in system prompt', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '# Briefing\nTest',
    } as any)

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'domain_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'memory_palace_entries') {
        return { insert: vi.fn().mockReturnValue({ error: null }) }
      }
      return {}
    })

    const supabase = { from: fromMock } as any
    await generateMorningBriefing(supabase, 'org-1')

    const callArgs = mockedGenerateText.mock.calls[0][0] as any
    expect(callArgs.system).toContain('priorities')
    expect(callArgs.system).toContain('deadlines')
    expect(callArgs.system).toContain('discoveries')
  })
})

// ─── startChiefLibrarian ───────────────────────────────────────────────────

describe('startChiefLibrarian', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a worker on the synthesis queue', () => {
    const supabase = {} as any
    startChiefLibrarian(supabase)

    expect(mockedCreateWorker).toHaveBeenCalledTimes(1)
    expect(mockedCreateWorker).toHaveBeenCalledWith(
      QUEUE_NAMES.synthesis,
      expect.any(Function),
      { concurrency: 1 },
    )
  })

  it('uses concurrency 1', () => {
    const supabase = {} as any
    startChiefLibrarian(supabase)

    const opts = mockedCreateWorker.mock.calls[0][2]
    expect(opts).toEqual({ concurrency: 1 })
  })

  it('returns the worker instance', () => {
    const supabase = {} as any
    const worker = startChiefLibrarian(supabase)

    expect(worker).toBeDefined()
    expect(worker).toHaveProperty('on')
    expect(worker).toHaveProperty('close')
  })
})

// ─── MAX_PROFILE_TOKENS constant ───────────────────────────────────────────

describe('chief-librarian constants', () => {
  it('MAX_PROFILE_TOKENS is 3000', () => {
    expect(MAX_PROFILE_TOKENS).toBe(3000)
  })
})
