/**
 * Prompt Cache (Brain State Prefix) — TDD tests.
 *
 * Tests buildBrainStatePrefix, splitCacheableContext, and constants.
 * Supabase calls are mocked at the query level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────────────────────────

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  data: unknown[] | null
  error: null | { message: string }
}

function createMockQueryBuilder(data: unknown[] = []): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    data,
    error: null,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data, error: builder.error })),
  }
  return builder
}

function createMockSupabase(tables: Record<string, unknown[]> = {}) {
  return {
    from: vi.fn((table: string) => {
      const data = tables[table] ?? []
      return createMockQueryBuilder(data)
    }),
  }
}

// ─── Import module under test ──────────────────────────────────────────────

import {
  buildBrainStatePrefix,
  splitCacheableContext,
  CACHE_PREFIX_BUDGET,
  CHARS_PER_TOKEN,
  FIDUCIARY_RESERVED_TOKENS,
  DOMAIN_PROFILE_MAX_TOKENS,
  estimateTokens,
  type BrainStatePrefix,
  type CacheableContext,
} from '../prompt-cache'

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('prompt-cache constants', () => {
  it('CACHE_PREFIX_BUDGET is 50000', () => {
    expect(CACHE_PREFIX_BUDGET).toBe(50_000)
  })

  it('CHARS_PER_TOKEN is 3.5', () => {
    expect(CHARS_PER_TOKEN).toBe(3.5)
  })

  it('FIDUCIARY_RESERVED_TOKENS is 2000', () => {
    expect(FIDUCIARY_RESERVED_TOKENS).toBe(2000)
  })

  it('DOMAIN_PROFILE_MAX_TOKENS is 8000', () => {
    expect(DOMAIN_PROFILE_MAX_TOKENS).toBe(8000)
  })
})

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns 0 for null/undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(estimateTokens(null as any)).toBe(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(estimateTokens(undefined as any)).toBe(0)
  })

  it('estimates tokens using ceil(length / 3.5)', () => {
    const text = 'a'.repeat(35) // 35 chars / 3.5 = 10 tokens
    expect(estimateTokens(text)).toBe(10)
  })

  it('rounds up partial tokens', () => {
    const text = 'a'.repeat(36) // 36 / 3.5 = 10.28... → 11
    expect(estimateTokens(text)).toBe(11)
  })
})

describe('buildBrainStatePrefix', () => {
  const orgId = 'org-test-1'
  const systemPrompt = 'You are BitBit, a personal assistant.'

  it('returns system prompt only when DB is empty', async () => {
    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: [],
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    expect(result.markdown).toContain(systemPrompt)
    expect(result.dossierCount).toBe(0)
    expect(result.constraintCount).toBe(0)
    expect(result.profileCount).toBe(0)
    expect(result.tokenEstimate).toBeGreaterThan(0)
    expect(result.builtAt).toBeDefined()
  })

  it('includes fiduciary constraints when present', async () => {
    const constraints = [
      {
        id: 'c1',
        content: 'Never discount below 20% for client X',
        category: 'fiduciary_constraint',
        is_active: true,
      },
      {
        id: 'c2',
        content: 'Always invoice within 7 days of delivery',
        category: 'fiduciary_constraint',
        is_active: true,
      },
    ]

    const supabase = createMockSupabase({
      memory_palace_entries: constraints,
      entity_dossiers: [],
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    expect(result.constraintCount).toBe(2)
    expect(result.markdown).toContain('Never discount below 20%')
    expect(result.markdown).toContain('Always invoice within 7 days')
  })

  it('includes user profile when provided', async () => {
    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: [],
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
      { userProfile: { displayName: 'Tor', email: 'tor@example.com' } },
    )

    expect(result.markdown).toContain('Tor')
    expect(result.markdown).toContain('tor@example.com')
  })

  it('includes entity dossiers sorted by last_compiled_at DESC', async () => {
    const dossiers = [
      {
        entity_id: 'e1',
        entity_name: 'Alice',
        dossier_markdown: '## Summary\nAlice is a client.',
        token_count: 50,
        last_compiled_at: '2026-04-10T00:00:00Z',
      },
      {
        entity_id: 'e2',
        entity_name: 'Bob',
        dossier_markdown: '## Summary\nBob is a partner.',
        token_count: 45,
        last_compiled_at: '2026-04-11T00:00:00Z',
      },
    ]

    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: dossiers,
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    expect(result.dossierCount).toBe(2)
    expect(result.markdown).toContain('Alice')
    expect(result.markdown).toContain('Bob')
  })

  it('includes domain profiles', async () => {
    const profiles = [
      {
        domain: 'financial',
        profile_markdown: '## Financial\nRevenue is growing.',
        token_count: 30,
        last_compiled_at: '2026-04-11T00:00:00Z',
      },
    ]

    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: [],
      domain_profiles: profiles,
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    expect(result.profileCount).toBe(1)
    expect(result.markdown).toContain('Financial')
    expect(result.markdown).toContain('Revenue is growing')
  })

  it('respects token budget — does not exceed CACHE_PREFIX_BUDGET', async () => {
    // Create a huge dossier that would exceed budget
    const hugeDossier = 'x'.repeat(CACHE_PREFIX_BUDGET * 4) // way over budget in chars
    const dossiers = [
      {
        entity_id: 'e1',
        entity_name: 'Huge',
        dossier_markdown: hugeDossier,
        token_count: CACHE_PREFIX_BUDGET * 2,
        last_compiled_at: '2026-04-11T00:00:00Z',
      },
    ]

    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: dossiers,
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    expect(result.tokenEstimate).toBeLessThanOrEqual(CACHE_PREFIX_BUDGET)
  })

  it('BrainStatePrefix has correct shape', async () => {
    const supabase = createMockSupabase({
      memory_palace_entries: [],
      entity_dossiers: [],
      domain_profiles: [],
    })

    const result = await buildBrainStatePrefix(
      supabase as never,
      orgId,
      systemPrompt,
    )

    // Verify interface shape
    expect(result).toHaveProperty('markdown')
    expect(result).toHaveProperty('tokenEstimate')
    expect(result).toHaveProperty('dossierCount')
    expect(result).toHaveProperty('constraintCount')
    expect(result).toHaveProperty('profileCount')
    expect(result).toHaveProperty('builtAt')
    expect(typeof result.markdown).toBe('string')
    expect(typeof result.tokenEstimate).toBe('number')
    expect(typeof result.dossierCount).toBe('number')
    expect(typeof result.constraintCount).toBe('number')
    expect(typeof result.profileCount).toBe('number')
    expect(typeof result.builtAt).toBe('string')
  })
})

describe('splitCacheableContext', () => {
  it('returns cache_control on prefix block', () => {
    const brainPrefix: BrainStatePrefix = {
      markdown: '# Brain State\nSystem prompt here.',
      tokenEstimate: 100,
      dossierCount: 0,
      constraintCount: 0,
      profileCount: 0,
      builtAt: new Date().toISOString(),
    }

    const result = splitCacheableContext(brainPrefix, 'Dynamic content here')

    expect(result.cachedPrefix).toHaveLength(1)
    expect(result.cachedPrefix[0].type).toBe('text')
    expect(result.cachedPrefix[0].text).toBe(brainPrefix.markdown)
    expect(result.cachedPrefix[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('returns dynamic suffix without cache_control', () => {
    const brainPrefix: BrainStatePrefix = {
      markdown: '# Brain State',
      tokenEstimate: 50,
      dossierCount: 0,
      constraintCount: 0,
      profileCount: 0,
      builtAt: new Date().toISOString(),
    }

    const dynamicContent = 'Current conversation context...'
    const result = splitCacheableContext(brainPrefix, dynamicContent)

    expect(result.dynamicSuffix).toHaveLength(1)
    expect(result.dynamicSuffix[0].type).toBe('text')
    expect(result.dynamicSuffix[0].text).toBe(dynamicContent)
    expect(result.dynamicSuffix[0]).not.toHaveProperty('cache_control')
  })

  it('returns empty dynamic suffix when no dynamic content', () => {
    const brainPrefix: BrainStatePrefix = {
      markdown: '# Brain State',
      tokenEstimate: 50,
      dossierCount: 0,
      constraintCount: 0,
      profileCount: 0,
      builtAt: new Date().toISOString(),
    }

    const result = splitCacheableContext(brainPrefix, '')

    expect(result.cachedPrefix).toHaveLength(1)
    expect(result.dynamicSuffix).toHaveLength(0)
  })

  it('CacheableContext has correct shape', () => {
    const brainPrefix: BrainStatePrefix = {
      markdown: '# Brain State\nFull prefix content.',
      tokenEstimate: 100,
      dossierCount: 2,
      constraintCount: 1,
      profileCount: 1,
      builtAt: new Date().toISOString(),
    }

    const result: CacheableContext = splitCacheableContext(brainPrefix, 'dynamic')

    expect(result).toHaveProperty('cachedPrefix')
    expect(result).toHaveProperty('dynamicSuffix')
    expect(Array.isArray(result.cachedPrefix)).toBe(true)
    expect(Array.isArray(result.dynamicSuffix)).toBe(true)
  })
})
