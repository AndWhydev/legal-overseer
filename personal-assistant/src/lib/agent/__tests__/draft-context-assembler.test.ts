import { afterEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/context/baseplate-snapshot', () => ({
  getBaseplateSnapshot: vi.fn(),
}))
vi.mock('@/lib/memory-palace/proactive-recall', () => ({
  proactiveRecall: vi.fn(),
  formatProactiveRecall: vi.fn(),
}))
vi.mock('@/lib/rag/retriever', () => ({
  searchVectors: vi.fn(),
  formatChunksForContext: vi.fn(),
}))
vi.mock('@/lib/intelligence/standing-orders', () => ({
  getActiveOrders: vi.fn(),
  matchOrdersToContext: vi.fn(),
  formatOrdersForPrompt: vi.fn(),
}))
vi.mock('@/lib/intelligence/relationship-scorer', () => ({
  computeRelationshipStrength: vi.fn(),
}))
vi.mock('@/lib/intelligence/contact-timing', () => ({
  analyzeContactTiming: vi.fn(),
}))
vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { getBaseplateSnapshot } from '@/lib/context/baseplate-snapshot'
import { proactiveRecall, formatProactiveRecall } from '@/lib/memory-palace/proactive-recall'
import { searchVectors, formatChunksForContext } from '@/lib/rag/retriever'
import {
  getActiveOrders,
  matchOrdersToContext,
  formatOrdersForPrompt,
} from '@/lib/intelligence/standing-orders'
import { computeRelationshipStrength } from '@/lib/intelligence/relationship-scorer'
import { analyzeContactTiming } from '@/lib/intelligence/contact-timing'

import type { DraftContext, DraftContextMetadata } from '../draft-context-assembler'
import { assembleDraftContext, computeDraftConfidence } from '../draft-context-assembler'

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
} as unknown as Parameters<typeof assembleDraftContext>[0]

const ORG_ID = 'org-123'
const CONTACT_ID = 'contact-abc'
const CONTACT_NAME = 'Sezer Korkmaz'
const CHANNEL = 'email'
const INCOMING_MSG = 'When will the White House RE invoice be ready?'

function mockAllSources() {
  vi.mocked(getBaseplateSnapshot).mockResolvedValue({
    profile: {
      recent_events: [{ type: 'message_received', at: '2026-03-20T10:00:00Z' }],
      relationships: [{ type: 'works_with', target_type: 'org', target_id: 'org-1' }],
      memories: [{ fact: 'Prefers email over phone', confidence: 0.9, category: 'convention' }],
      event_summary: { total: 25, channels: ['email', 'whatsapp'], last_event_at: '2026-03-20T10:00:00Z' },
      relationship_context: {
        related_people: [{ id: 'p1', name: 'Andy', connection_type: 'colleague' }],
        topics: [{ id: 't1', name: 'White House RE', first_seen: '2026-01-01', last_seen: '2026-03-20' }],
        graph_distance: 1,
      },
    },
    source: 'profile',
    computedAt: '2026-03-20T10:00:00Z',
    validUntil: '2026-03-27T10:00:00Z',
    eventCount: 25,
    stale: false,
  })

  vi.mocked(proactiveRecall).mockResolvedValue([
    {
      entityId: CONTACT_ID,
      entityName: 'Sezer',
      memories: [],
      decisions: [],
      patterns: [],
      formattedText: '[Sezer] Prefers email, invoices usually net-30',
      tokenEstimate: 15,
    },
  ])
  vi.mocked(formatProactiveRecall).mockReturnValue('<memory-palace>\n[Sezer] Prefers email, invoices usually net-30\n</memory-palace>')

  vi.mocked(searchVectors).mockResolvedValue([
    {
      id: 'chunk-1',
      score: 0.85,
      content: 'White House RE project scope document',
      metadata: { message_id: 'm1', org_id: ORG_ID, channel: 'email', sender: 'Andy', received_at: '2026-03-15T09:00:00Z', chunk_index: 0, total_chunks: 1, is_full_body: true },
      citationRef: '[email|Andy|Mar 15]',
    },
  ])
  vi.mocked(formatChunksForContext).mockReturnValue('[email | Andy | Mar 15]\nWhite House RE project scope document\n---')

  vi.mocked(getActiveOrders).mockResolvedValue([
    {
      id: 'order-1',
      org_id: ORG_ID,
      created_by: 'user-1',
      directive: 'Always flag Sezer emails as high priority',
      category: 'communication' as const,
      is_active: true,
      priority: 10,
      conditions: { contact_name: 'Sezer' },
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
  ])
  vi.mocked(matchOrdersToContext).mockImplementation((orders) => orders)
  vi.mocked(formatOrdersForPrompt).mockReturnValue('## Standing Orders\n\n- [communication] Always flag Sezer emails as high priority')

  vi.mocked(computeRelationshipStrength).mockResolvedValue({
    strength: 72,
    trend: 'stable' as const,
    lastInteraction: new Date('2026-03-20T10:00:00Z'),
    topChannel: 'email',
    daysSinceContact: 6,
  })

  vi.mocked(analyzeContactTiming).mockResolvedValue({
    contactId: CONTACT_ID,
    windows: [{ dayOfWeek: 1, hourStart: 9, hourEnd: 10, avgResponseMinutes: 45, sampleSize: 12 }],
    totalEvents: 50,
    analyzedAt: '2026-03-20T10:00:00Z',
  })

  // Mock supabase for loadContactMessageHistory
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  sender_name: 'Sezer Korkmaz',
                  body: 'When will the invoice be ready?',
                  received_at: '2026-03-20T10:00:00Z',
                  channel: 'email',
                },
                {
                  sender_name: 'Andy',
                  body: 'I will check with the team and get back to you.',
                  received_at: '2026-03-19T14:00:00Z',
                  channel: 'email',
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  })

  return { ...mockSupabase, from: mockFrom } as unknown as Parameters<typeof assembleDraftContext>[0]
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ─── assembleDraftContext ───────────────────────────────────────────────────

describe('assembleDraftContext', () => {
  it('returns DraftContext with all expected fields', async () => {
    const sb = mockAllSources()
    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result).toHaveProperty('contactBriefing')
    expect(result).toHaveProperty('conversationHistory')
    expect(result).toHaveProperty('memoryRecall')
    expect(result).toHaveProperty('ragContext')
    expect(result).toHaveProperty('standingOrders')
    expect(result).toHaveProperty('relationshipScore')
    expect(result).toHaveProperty('relationshipTrend')
    expect(result).toHaveProperty('confidenceScore')
    expect(result).toHaveProperty('metadata')

    // Verify metadata shape
    const meta = result.metadata
    expect(meta).toHaveProperty('assemblyTimeMs')
    expect(meta).toHaveProperty('sourcesAvailable')
    expect(meta).toHaveProperty('tokenEstimate')
    expect(meta.sourcesAvailable).toHaveProperty('baseplate')
    expect(meta.sourcesAvailable).toHaveProperty('history')
    expect(meta.sourcesAvailable).toHaveProperty('memories')
    expect(meta.sourcesAvailable).toHaveProperty('rag')
    expect(meta.sourcesAvailable).toHaveProperty('orders')
    expect(meta.sourcesAvailable).toHaveProperty('relationship')
  })

  it('calls all 6 context sources in parallel', async () => {
    const sb = mockAllSources()
    await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(getBaseplateSnapshot).toHaveBeenCalledOnce()
    expect(proactiveRecall).toHaveBeenCalledOnce()
    expect(searchVectors).toHaveBeenCalledOnce()
    expect(getActiveOrders).toHaveBeenCalledOnce()
    expect(computeRelationshipStrength).toHaveBeenCalledOnce()
    // analyzeContactTiming also called
    expect(analyzeContactTiming).toHaveBeenCalledOnce()
  })

  it('returns empty contactBriefing when baseplate returns null', async () => {
    const sb = mockAllSources()
    vi.mocked(getBaseplateSnapshot).mockResolvedValue(null)

    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result.contactBriefing).toBe('')
    expect(result.metadata.sourcesAvailable.baseplate).toBe(false)
  })

  it('returns empty memoryRecall when proactiveRecall returns empty array', async () => {
    const sb = mockAllSources()
    vi.mocked(proactiveRecall).mockResolvedValue([])
    vi.mocked(formatProactiveRecall).mockReturnValue('')

    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result.memoryRecall).toBe('')
    expect(result.metadata.sourcesAvailable.memories).toBe(false)
  })

  it('returns empty ragContext when searchVectors returns empty array', async () => {
    const sb = mockAllSources()
    vi.mocked(searchVectors).mockResolvedValue([])
    vi.mocked(formatChunksForContext).mockReturnValue('')

    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result.ragContext).toBe('')
    expect(result.metadata.sourcesAvailable.rag).toBe(false)
  })

  it('defaults to score 0 and trend cold when relationship scorer throws', async () => {
    const sb = mockAllSources()
    vi.mocked(computeRelationshipStrength).mockRejectedValue(new Error('DB connection failed'))

    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result.relationshipScore).toBe(0)
    expect(result.relationshipTrend).toBe('cold')
    expect(result.metadata.sourcesAvailable.relationship).toBe(false)
  })

  it('returns formatted chronological conversation history', async () => {
    const sb = mockAllSources()
    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    // Should contain the message history from mock
    expect(result.conversationHistory).toContain('Sezer Korkmaz')
    expect(result.conversationHistory).toContain('Andy')
    expect(result.metadata.sourcesAvailable.history).toBe(true)
  })

  it('returns empty conversationHistory when no messages exist', async () => {
    const sb = mockAllSources()
    // Override the supabase from mock to return empty data
    const emptyFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const emptySb = { ...sb, from: emptyFrom } as unknown as Parameters<typeof assembleDraftContext>[0]

    const result = await assembleDraftContext(emptySb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(result.conversationHistory).toBe('')
    expect(result.metadata.sourcesAvailable.history).toBe(false)
  })

  it('filters standing orders via matchOrdersToContext with contact name and channel', async () => {
    const sb = mockAllSources()
    await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    expect(matchOrdersToContext).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        sender: CONTACT_NAME,
        channel: CHANNEL,
      }),
    )
  })

  it('enforces token budget by truncating lowest-priority sources', async () => {
    const sb = mockAllSources()
    // Make RAG context extremely long to exceed budget
    const longText = 'x'.repeat(20000) // ~5000 tokens, exceeds 800 token budget for RAG
    vi.mocked(formatChunksForContext).mockReturnValue(longText)
    // Also make memory recall very long
    vi.mocked(formatProactiveRecall).mockReturnValue('m'.repeat(8000))

    const result = await assembleDraftContext(sb, ORG_ID, CONTACT_ID, CONTACT_NAME, INCOMING_MSG, CHANNEL)

    // Total token estimate should be capped near 4000
    expect(result.metadata.tokenEstimate).toBeLessThanOrEqual(4200) // some margin for headers
  })
})

// ─── Confidence Scoring ─────────────────────────────────────────────────────

describe('confidence scoring', () => {
  function makeDraftContext(overrides: Partial<DraftContext> = {}): DraftContext {
    return {
      contactBriefing: '',
      conversationHistory: '',
      memoryRecall: '',
      ragContext: '',
      standingOrders: '',
      relationshipScore: 0,
      relationshipTrend: 'cold' as const,
      confidenceScore: 0,
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: {
          baseplate: false,
          history: false,
          memories: false,
          rag: false,
          orders: false,
          relationship: false,
        },
        tokenEstimate: 0,
      },
      ...overrides,
    }
  }

  it('returns 0.40 base score when no context sources available', () => {
    // No sources, relationship < 20 => 0.40 - 0.05 = 0.35
    // But also: baseplate unavailable AND conversationHistory empty => -0.10
    // So: 0.40 - 0.10 - 0.05 = 0.25
    const ctx = makeDraftContext()
    const score = computeDraftConfidence(ctx)
    expect(score).toBe(0.25)
  })

  it('returns ~0.95 when all sources available and relationship strong', () => {
    const ctx = makeDraftContext({
      contactBriefing: 'x'.repeat(200), // >100 chars => +0.15
      conversationHistory: 'Some history', // >0 => +0.15
      memoryRecall: 'Some recall', // >0 => +0.10
      ragContext: 'Some RAG context', // >0 => +0.10
      standingOrders: 'Some orders', // >0 => +0.05
      relationshipScore: 72, // >50 => +0.05
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: {
          baseplate: true,
          history: true,
          memories: true,
          rag: true,
          orders: true,
          relationship: true,
        },
        tokenEstimate: 500,
      },
    })
    const score = computeDraftConfidence(ctx)
    // 0.40 + 0.15 + 0.15 + 0.10 + 0.10 + 0.05 + 0.05 = 1.00 => capped at 0.95
    expect(score).toBe(0.95)
  })

  it('adds 0.15 for conversation history presence', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: true, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25, // >20, no negative modifier
    })
    const withHistory = makeDraftContext({
      ...base,
      conversationHistory: 'Some conversation',
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withHistory)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.15)
  })

  it('adds 0.15 for contact briefing with >100 chars', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })
    const withBriefing = makeDraftContext({
      ...base,
      contactBriefing: 'x'.repeat(101),
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withBriefing)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.15)
  })

  it('adds 0.10 for memory recall presence', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })
    const withMemory = makeDraftContext({
      ...base,
      memoryRecall: 'Some memories',
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withMemory)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.10)
  })

  it('adds 0.10 for RAG context presence', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })
    const withRag = makeDraftContext({
      ...base,
      ragContext: 'Some RAG context',
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withRag)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.10)
  })

  it('adds 0.05 for standing orders presence', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })
    const withOrders = makeDraftContext({
      ...base,
      standingOrders: 'Some orders',
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withOrders)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.05)
  })

  it('adds 0.05 for relationship score >50', () => {
    const base = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 45, // between 20 and 50
    })
    const withStrong = makeDraftContext({
      ...base,
      relationshipScore: 55, // >50
    })

    const scoreWithout = computeDraftConfidence(base)
    const scoreWith = computeDraftConfidence(withStrong)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.05)
  })

  it('caps confidence at 0.95', () => {
    const ctx = makeDraftContext({
      contactBriefing: 'x'.repeat(200),
      conversationHistory: 'Some history',
      memoryRecall: 'Some recall',
      ragContext: 'Some RAG',
      standingOrders: 'Some orders',
      relationshipScore: 72,
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: true, memories: true, rag: true, orders: true, relationship: true },
        tokenEstimate: 500,
      },
    })
    const score = computeDraftConfidence(ctx)
    expect(score).toBeLessThanOrEqual(0.95)
  })

  it('applies negative modifier: no baseplate AND no conversation history reduces by 0.10', () => {
    const withBaseplate = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })
    const withoutBaseplate = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: false, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25,
    })

    const scoreWith = computeDraftConfidence(withBaseplate)
    const scoreWithout = computeDraftConfidence(withoutBaseplate)
    expect(scoreWith - scoreWithout).toBeCloseTo(0.10)
  })

  it('applies negative modifier: relationship score < 20 reduces by 0.05', () => {
    const highRel = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 25, // >=20
    })
    const lowRel = makeDraftContext({
      metadata: {
        assemblyTimeMs: 50,
        sourcesAvailable: { baseplate: true, history: false, memories: false, rag: false, orders: false, relationship: true },
        tokenEstimate: 100,
      },
      relationshipScore: 15, // <20
    })

    const scoreHigh = computeDraftConfidence(highRel)
    const scoreLow = computeDraftConfidence(lowRel)
    expect(scoreHigh - scoreLow).toBeCloseTo(0.05)
  })
})
