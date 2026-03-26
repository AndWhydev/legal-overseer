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
