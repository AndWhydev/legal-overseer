import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LivingBrainAdapter, TIER_CONFIGS } from '../adapters/living-brain'
import type { BrainSpec, Trace } from '../types'
import type { AssembledContext, Outcome } from '../ports'

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeTrace(overrides?: Partial<Trace>): Trace {
  return {
    traceId: 'test-trace-1',
    orgId: 'org-1',
    userId: 'user-1',
    role: 'classify',
    startedAt: Date.now(),
    ...overrides,
  }
}

function makeSpec(overrides?: Partial<BrainSpec>): BrainSpec {
  return {
    tier: 'minimal',
    ...overrides,
  }
}

function makeMockAssembledContext(partial?: Partial<AssembledContext>): AssembledContext {
  return {
    systemPrompt: 'You are BitBit.',
    messageHistory: [{ role: 'user', content: 'hello' }],
    metadata: {
      tokenUsage: {
        systemPrompt: 100,
        entityContext: 0,
        recentTurns: 50,
        compressedHistory: 0,
        keyFacts: 0,
        pendingActions: 0,
        retrievedContext: 0,
        skillPrompts: 0,
        executionContext: 0,
        total: 150,
        budget: 8000,
        overBudget: false,
      },
      tiersLoaded: [
        { tier: 'working', loaded: true, latencyMs: 10, tokenCount: 100 },
      ],
      assemblyMs: 15,
      entityMentions: [],
      pendingActionCount: 0,
      surfacedMemoryIds: [],
    },
    ...partial,
  }
}

// ─── Mock ContextAssembler ──────────────────────────────────────────────────

const mockAssemble = vi.fn<[], Promise<AssembledContext>>()

vi.mock('@/lib/context-assembly/context-assembler', () => ({
  ContextAssembler: class MockContextAssembler {
    config: Record<string, unknown>
    constructor(config: Record<string, unknown>) {
      this.config = config
    }
    assemble = mockAssemble
  },
}))

// ─── Mock service client ────────────────────────────────────────────────────

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: () => ({ from: vi.fn() }),
  isServiceClientConfigured: () => true,
}))

// ─── Mock logger ────────────────────────────────────────────────────────────

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LivingBrainAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssemble.mockResolvedValue(makeMockAssembledContext())
  })

  // ── BrainPort interface conformance ─────────────────────────────────────

  describe('interface conformance', () => {
    it('implements assemble() and recordFeedback()', () => {
      const adapter = new LivingBrainAdapter()
      expect(typeof adapter.assemble).toBe('function')
      expect(typeof adapter.recordFeedback).toBe('function')
    })

    it('assemble() returns AssembledContext shape', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      const result = await adapter.assemble(makeSpec(), makeTrace())

      expect(result).toHaveProperty('systemPrompt')
      expect(result).toHaveProperty('messageHistory')
      expect(result).toHaveProperty('metadata')
      expect(result.metadata).toHaveProperty('tokenUsage')
      expect(result.metadata).toHaveProperty('tiersLoaded')
      expect(result.metadata).toHaveProperty('assemblyMs')
      expect(result.metadata).toHaveProperty('entityMentions')
      expect(result.metadata).toHaveProperty('pendingActionCount')
      expect(result.metadata).toHaveProperty('surfacedMemoryIds')
    })
  })

  // ── Tier configuration ──────────────────────────────────────────────────

  describe('tier configurations', () => {
    it('minimal tier has low token budget and disables most features', () => {
      const config = TIER_CONFIGS.minimal
      expect(config.tokenBudget).toBe(8_000)
      expect(config.maxRecentTurns).toBe(0)
      expect(config.maxEntities).toBe(0)
      expect(config.includePendingActions).toBe(false)
      expect(config.includeCompressedHistory).toBe(false)
      expect(config.useGlobalWorkspace).toBe(false)
      expect(config.usePromptCache).toBe(false)
    })

    it('standard tier has moderate token budget and enables history', () => {
      const config = TIER_CONFIGS.standard
      expect(config.tokenBudget).toBe(32_000)
      expect(config.maxRecentTurns).toBe(10)
      expect(config.maxEntities).toBe(3)
      expect(config.includePendingActions).toBe(true)
      expect(config.includeCompressedHistory).toBe(true)
      expect(config.useGlobalWorkspace).toBe(false)
      expect(config.usePromptCache).toBe(false)
    })

    it('full tier enables all features with maximum budget', () => {
      const config = TIER_CONFIGS.full
      expect(config.tokenBudget).toBe(48_000)
      expect(config.maxRecentTurns).toBe(20)
      expect(config.maxEntities).toBe(5)
      expect(config.includePendingActions).toBe(true)
      expect(config.includeCompressedHistory).toBe(true)
      expect(config.useGlobalWorkspace).toBe(true)
      expect(config.usePromptCache).toBe(true)
    })

    it('covers all non-none BrainTier values', () => {
      expect(Object.keys(TIER_CONFIGS)).toEqual(['minimal', 'standard', 'full'])
    })
  })

  // ── assemble() behavior ─────────────────────────────────────────────────

  describe('assemble()', () => {
    it('delegates to ContextAssembler with tier-appropriate config', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      await adapter.assemble(makeSpec({ tier: 'standard' }), makeTrace())

      // ContextAssembler was constructed and assemble() was called
      expect(mockAssemble).toHaveBeenCalledOnce()
    })

    it('passes orgId from trace to ContextAssembler.assemble()', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      await adapter.assemble(
        makeSpec({ tier: 'full' }),
        makeTrace({ orgId: 'org-42', userId: 'user-99' }),
      )

      // Second arg to assemble is userId (or orgId fallback), third is orgId
      expect(mockAssemble).toHaveBeenCalledWith(
        expect.anything(), // supabase client
        'user-99',         // userId
        'org-42',          // orgId
        expect.any(String), // threadId
        expect.any(String), // currentMessage
      )
    })

    it('uses spec.threadId when provided', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      await adapter.assemble(
        makeSpec({ tier: 'minimal', threadId: 'thread-abc' }),
        makeTrace(),
      )

      expect(mockAssemble).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.any(String),
        'thread-abc',
        expect.any(String),
      )
    })

    it('generates synthetic threadId when spec.threadId is absent', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      await adapter.assemble(makeSpec({ tier: 'minimal' }), makeTrace({ traceId: 'tr-123' }))

      expect(mockAssemble).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.any(String),
        'synthetic-tr-123',
        expect.any(String),
      )
    })

    it('falls back to orgId when userId is not in trace', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      await adapter.assemble(
        makeSpec({ tier: 'standard' }),
        makeTrace({ orgId: 'org-fallback', userId: undefined }),
      )

      expect(mockAssemble).toHaveBeenCalledWith(
        expect.anything(),
        'org-fallback', // userId falls back to orgId
        'org-fallback',
        expect.any(String),
        expect.any(String),
      )
    })

    it('returns assembled context from ContextAssembler', async () => {
      const expected = makeMockAssembledContext({
        systemPrompt: 'Custom prompt for test',
      })
      mockAssemble.mockResolvedValueOnce(expected)

      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      const result = await adapter.assemble(makeSpec({ tier: 'full' }), makeTrace())

      expect(result.systemPrompt).toBe('Custom prompt for test')
      expect(result).toBe(expected)
    })
  })

  // ── Graceful degradation ────────────────────────────────────────────────

  describe('graceful degradation', () => {
    it('returns empty context when getSupabase throws', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => { throw new Error('no supabase') },
      })

      const result = await adapter.assemble(makeSpec(), makeTrace())

      expect(result.systemPrompt).toBe('')
      expect(result.messageHistory).toEqual([])
      expect(result.metadata.tokenUsage.total).toBe(0)
    })

    it('returns empty context when ContextAssembler.assemble() throws', async () => {
      mockAssemble.mockRejectedValueOnce(new Error('DB connection failed'))

      const adapter = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })

      const result = await adapter.assemble(makeSpec({ tier: 'full' }), makeTrace())

      expect(result.systemPrompt).toBe('')
      expect(result.messageHistory).toEqual([])
      expect(result.metadata.tokenUsage.total).toBe(0)
      expect(result.metadata.assemblyMs).toBeGreaterThanOrEqual(0)
    })

    it('empty context has correct TokenAllocation shape', async () => {
      const adapter = new LivingBrainAdapter({
        getSupabase: () => { throw new Error('nope') },
      })

      const result = await adapter.assemble(makeSpec(), makeTrace())
      const usage = result.metadata.tokenUsage

      expect(usage).toEqual({
        systemPrompt: 0,
        entityContext: 0,
        recentTurns: 0,
        compressedHistory: 0,
        keyFacts: 0,
        pendingActions: 0,
        retrievedContext: 0,
        skillPrompts: 0,
        executionContext: 0,
        total: 0,
        budget: 0,
        overBudget: false,
      })
    })
  })

  // ── recordFeedback() ────────────────────────────────────────────────────

  describe('recordFeedback()', () => {
    it('does not throw on success outcome', async () => {
      const adapter = new LivingBrainAdapter()
      const outcome: Outcome = { status: 'success' }

      await expect(adapter.recordFeedback('trace-1', outcome)).resolves.toBeUndefined()
    })

    it('does not throw on error outcome', async () => {
      const adapter = new LivingBrainAdapter()
      const outcome: Outcome = { status: 'error', kind: 'timeout' }

      await expect(adapter.recordFeedback('trace-1', outcome)).resolves.toBeUndefined()
    })

    it('does not throw on corrected outcome', async () => {
      const adapter = new LivingBrainAdapter()
      const outcome: Outcome = {
        status: 'corrected',
        originalText: 'wrong answer',
        userCorrection: 'right answer',
      }

      await expect(adapter.recordFeedback('trace-1', outcome)).resolves.toBeUndefined()
    })
  })

  // ── Constructor options ─────────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts no arguments (uses defaults)', () => {
      const adapter = new LivingBrainAdapter()
      expect(adapter).toBeInstanceOf(LivingBrainAdapter)
    })

    it('accepts getSupabase override for testing', () => {
      const mockClient = { from: vi.fn() } as never
      const adapter = new LivingBrainAdapter({
        getSupabase: () => mockClient,
      })
      expect(adapter).toBeInstanceOf(LivingBrainAdapter)
    })
  })

  // ── Integration: ask() flow ─────────────────────────────────────────────

  describe('integration with ask()', () => {
    it('can be used as brain adapter in withAdapters()', async () => {
      const { withAdapters } = await import('../runtime')
      const { InMemoryModelAdapter } = await import('../adapters/in-memory-model')
      const { InMemoryCostAdapter } = await import('../adapters/in-memory-cost')
      const { SpyObsAdapter } = await import('../adapters/spy-observability')
      const { ask } = await import('../ask')
      const { withAi } = await import('../with-ai')

      const model = new InMemoryModelAdapter()
      model.whenRole('classify').respondText('spam')

      const brain = new LivingBrainAdapter({
        getSupabase: () => ({ from: vi.fn() }) as never,
      })
      const cost = new InMemoryCostAdapter()
      const obs = new SpyObsAdapter()

      const result = await withAdapters({ model, brain, cost, obs }, () =>
        withAi(makeTrace(), () =>
          ask('classify', 'is this spam?')
        )
      )

      expect(result).toBe('spam')
    })
  })
})
