/**
 * Prompt Cache Integration — verifies that ContextAssembler with
 * usePromptCache=true produces systemContentBlocks with cache_control
 * markers, and that an empty dossier table still yields a valid prefix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────────────────────────

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  textSearch: ReturnType<typeof vi.fn>
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
    gte: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data, error: builder.error })),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data?.[0] ?? null, error: builder.error })),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: builder.data?.[0] ?? null, error: builder.error })),
  }
  return builder
}

// Table-specific data stores for selective mocking
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

// Mock the prompt builder to return a simple system prompt
vi.mock('@/lib/agent/prompt-builder', () => ({
  buildBasePrompt: vi.fn(() => 'You are BitBit, a personal AI assistant.'),
  buildEntityAwarePrompt: vi.fn(async () => 'You are BitBit, a personal AI assistant.'),
}))

// Mock memory palace
vi.mock('@/lib/memory/memory-palace', () => ({
  MemoryPalaceService: vi.fn().mockImplementation(() => ({
    getRecentMemories: vi.fn().mockResolvedValue([]),
    searchMemories: vi.fn().mockResolvedValue([]),
    getActiveConstraints: vi.fn().mockResolvedValue([]),
  })),
}))

// Mock the compiled memory to avoid DB calls
vi.mock('@/lib/context-assembly/tiers/compiled-memory', () => ({
  loadCompiledMemory: vi.fn().mockResolvedValue({
    section: '',
    tokenCount: 0,
    memories: [],
    surfacedMemoryIds: [],
  }),
}))

// Mock predictive loader
vi.mock('@/lib/context-assembly/predictive-loader', () => ({
  loadPredictiveContext: vi.fn().mockResolvedValue({ section: '', tokenCount: 0 }),
}))

// Mock global workspace
vi.mock('@/lib/brain/global-workspace', () => ({
  allocateContextBudget: vi.fn(),
  detectModuleContext: vi.fn().mockReturnValue([]),
}))

// ─── Tests ────────────────────────────────────────────────────────────────

import { buildBrainStatePrefix, splitCacheableContext } from '@/lib/brain/prompt-cache'

describe('Prompt Cache Integration', () => {
  beforeEach(() => {
    // Reset table data
    for (const key of Object.keys(tableData)) delete tableData[key]
  })

  describe('buildBrainStatePrefix + splitCacheableContext', () => {
    it('produces systemContentBlocks with cache_control markers when dossiers exist', async () => {
      const supabase = mockSupabase()

      // Set up dossier data
      tableData['entity_dossiers'] = [
        {
          entity_id: 'ent-1',
          entity_name: 'Acme Corp',
          dossier_markdown: 'A technology company founded in 2020.',
          token_count: 50,
          last_compiled_at: '2026-04-15T00:00:00Z',
        },
      ]
      tableData['memory_palace_entries'] = []
      tableData['domain_profiles'] = []

      const systemPrompt = 'You are BitBit, a personal AI assistant.'
      const prefix = await buildBrainStatePrefix(
        supabase as any,
        'org-123',
        systemPrompt,
        { userProfile: { displayName: 'Tor', email: 'tor@test.com' } },
      )

      expect(prefix.dossierCount).toBe(1)
      expect(prefix.markdown).toContain('Acme Corp')
      expect(prefix.markdown).toContain('Entity Dossiers')
      expect(prefix.tokenEstimate).toBeGreaterThan(0)

      // Split into cacheable context
      const cacheable = splitCacheableContext(prefix, '')
      expect(cacheable.cachedPrefix).toHaveLength(1)
      expect(cacheable.cachedPrefix[0].cache_control).toEqual({ type: 'ephemeral' })
      expect(cacheable.cachedPrefix[0].text).toContain('Acme Corp')
      expect(cacheable.dynamicSuffix).toHaveLength(0)
    })

    it('produces a valid prefix with empty dossier table (just system prompt)', async () => {
      const supabase = mockSupabase()

      tableData['entity_dossiers'] = []
      tableData['memory_palace_entries'] = []
      tableData['domain_profiles'] = []

      const systemPrompt = 'You are BitBit, a personal AI assistant.'
      const prefix = await buildBrainStatePrefix(
        supabase as any,
        'org-123',
        systemPrompt,
      )

      expect(prefix.dossierCount).toBe(0)
      expect(prefix.profileCount).toBe(0)
      expect(prefix.markdown).toContain(systemPrompt)
      expect(prefix.tokenEstimate).toBeGreaterThan(0)

      // Should still produce valid content blocks
      const cacheable = splitCacheableContext(prefix, '')
      expect(cacheable.cachedPrefix).toHaveLength(1)
      expect(cacheable.cachedPrefix[0].cache_control).toEqual({ type: 'ephemeral' })
      expect(cacheable.cachedPrefix[0].text).toBe(systemPrompt)
    })

    it('includes domain profiles when available', async () => {
      const supabase = mockSupabase()

      tableData['entity_dossiers'] = []
      tableData['memory_palace_entries'] = []
      tableData['domain_profiles'] = [
        {
          domain: 'finance',
          profile_markdown: 'Manages invoices via Xero.',
          token_count: 30,
          last_compiled_at: '2026-04-15T00:00:00Z',
        },
      ]

      const systemPrompt = 'You are BitBit.'
      const prefix = await buildBrainStatePrefix(
        supabase as any,
        'org-123',
        systemPrompt,
      )

      expect(prefix.profileCount).toBe(1)
      expect(prefix.markdown).toContain('Finance Domain')
      expect(prefix.markdown).toContain('Manages invoices via Xero')
    })
  })

  describe('systemContentBlocks structure', () => {
    it('content blocks have the correct Anthropic-compatible shape', async () => {
      const supabase = mockSupabase()
      tableData['entity_dossiers'] = []
      tableData['memory_palace_entries'] = []
      tableData['domain_profiles'] = []

      const prefix = await buildBrainStatePrefix(
        supabase as any,
        'org-123',
        'System prompt here.',
      )

      const cacheable = splitCacheableContext(prefix, 'Dynamic content here.')

      // Cached prefix block
      expect(cacheable.cachedPrefix[0]).toEqual({
        type: 'text',
        text: expect.any(String),
        cache_control: { type: 'ephemeral' },
      })

      // Dynamic suffix block
      expect(cacheable.dynamicSuffix).toHaveLength(1)
      expect(cacheable.dynamicSuffix[0]).toEqual({
        type: 'text',
        text: 'Dynamic content here.',
      })
    })
  })
})
