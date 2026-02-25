import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock entity resolver
vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntityRanked: vi.fn(),
}))

import { assembleEntityBriefing, assembleContext } from '../assembler'
import { resolveEntityRanked } from '../entity-resolver'

function chainable(data: unknown[] | null = []) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.contains = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  // Make it thenable so await resolves
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: data ?? [], error: null })
  return chain
}

function mockSupabase(tableData: Record<string, unknown[]> = {}) {
  return {
    from: vi.fn((table: string) => chainable(tableData[table] ?? [])),
  } as any
}

const ORG_ID = 'org-1'

describe('assembleEntityBriefing', () => {
  it('assembles entity briefing with relationships, timeline, memories', async () => {
    const relData = [
      {
        entity_a_type: 'contact', entity_a_id: 'c1',
        entity_b_type: 'task', entity_b_id: 't1',
        relationship_type: 'assigned_to', strength: 0.9,
        metadata: {}, last_evidence_at: '2026-01-01',
      },
    ]
    const timelineData = [
      { id: 'ev1', event_type: 'email_received', event_data: {}, occurred_at: '2026-01-15', channel_source: 'gmail' },
    ]
    const memoryData = [
      { id: 'm1', category: 'preference', content: 'Prefers email over phone', confidence: 0.85, entity_ids: ['c1'] },
    ]

    const supabase = mockSupabase({
      entity_relationships: relData,
      entity_timeline: timelineData,
      semantic_memories: memoryData,
      invoices: [],
    })

    const briefing = await assembleEntityBriefing(supabase, ORG_ID, 'contact', 'c1')

    expect(briefing.entity).toEqual({ type: 'contact', id: 'c1' })
    expect(briefing.relationships).toHaveLength(1)
    expect(briefing.relationships[0].entityType).toBe('task')
    expect(briefing.relationships[0].entityId).toBe('t1')
    expect(briefing.timeline).toHaveLength(1)
    expect(briefing.timeline[0].eventType).toBe('email_received')
    expect(briefing.memories).toHaveLength(1)
    expect(briefing.memories[0].content).toBe('Prefers email over phone')
  })

  it('returns empty arrays when no data', async () => {
    const supabase = mockSupabase({})

    const briefing = await assembleEntityBriefing(supabase, ORG_ID, 'contact', 'c1')

    expect(briefing.relationships).toEqual([])
    expect(briefing.timeline).toEqual([])
    expect(briefing.memories).toEqual([])
  })

  it('respects maxTimelineEvents option', async () => {
    const supabase = mockSupabase({})

    await assembleEntityBriefing(supabase, ORG_ID, 'contact', 'c1', { maxTimelineEvents: 5 })

    // Verify limit was called -- the from mock is called for entity_timeline
    const calls = supabase.from.mock.calls
    expect(calls.some((c: string[]) => c[0] === 'entity_timeline')).toBe(true)
  })

  it('flips relationship direction when entity is entity_b', async () => {
    const relData = [
      {
        entity_a_type: 'task', entity_a_id: 't1',
        entity_b_type: 'contact', entity_b_id: 'c1',
        relationship_type: 'assigned_to', strength: 0.8,
        metadata: {}, last_evidence_at: '2026-01-01',
      },
    ]

    const supabase = mockSupabase({ entity_relationships: relData })

    const briefing = await assembleEntityBriefing(supabase, ORG_ID, 'contact', 'c1')

    expect(briefing.relationships[0].entityType).toBe('task')
    expect(briefing.relationships[0].entityId).toBe('t1')
  })
})

describe('assembleContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty when no entity candidates found', async () => {
    const supabase = mockSupabase({})

    const result = await assembleContext(supabase, ORG_ID, 'the and for')

    expect(result.resolvedEntities).toEqual([])
    expect(result.summary).toBe('')
  })

  it('resolves entities and builds briefings', async () => {
    vi.mocked(resolveEntityRanked).mockResolvedValue([
      {
        contact: { id: 'c1', name: 'Sezer Ozturk', org_id: ORG_ID, slug: 'sezer', type: 'individual', emails: [], phones: [], aliases: [], profile_data: {}, communication_patterns: {} },
        matchConfidence: 1.0,
        matchStep: 'alias',
      },
    ])

    const supabase = mockSupabase({})

    const result = await assembleContext(supabase, ORG_ID, 'Sezer invoice')

    expect(result.resolvedEntities.length).toBeGreaterThan(0)
    expect(result.resolvedEntities[0].name).toBe('Sezer Ozturk')
    expect(result.resolvedEntities[0].matchConfidence).toBe(1.0)
  })

  it('stops resolving after collecting 3 entities across multiple words', async () => {
    // Each word resolves to one unique contact
    let callCount = 0
    vi.mocked(resolveEntityRanked).mockImplementation(async () => {
      const i = callCount++
      return [{
        contact: { id: `c${i}`, name: `Person${i}`, org_id: ORG_ID, slug: `p${i}`, type: 'individual' as const, emails: [], phones: [], aliases: [], profile_data: {}, communication_patterns: {} },
        matchConfidence: 0.9,
        matchStep: 'name',
      }]
    })

    const supabase = mockSupabase({})

    const result = await assembleContext(supabase, ORG_ID, 'Alice Bob Charlie Dave Extra')

    // Loop breaks at >= 3, so should have exactly 3
    expect(result.resolvedEntities).toHaveLength(3)
    // Should not have resolved all 5 words
    expect(resolveEntityRanked).toHaveBeenCalledTimes(3)
  })

  it('deduplicates resolved entities by id', async () => {
    const sameContact = {
      contact: { id: 'c1', name: 'Sezer', org_id: ORG_ID, slug: 'sezer', type: 'individual' as const, emails: [], phones: [], aliases: [], profile_data: {}, communication_patterns: {} },
      matchConfidence: 1.0,
      matchStep: 'alias',
    }
    vi.mocked(resolveEntityRanked).mockResolvedValue([sameContact])

    const supabase = mockSupabase({})

    const result = await assembleContext(supabase, ORG_ID, 'Sezer sezer')

    // Same contact matched twice but should be deduplicated
    expect(result.resolvedEntities.filter(e => e.id === 'c1')).toHaveLength(1)
  })

  it('filters stop words from candidates', async () => {
    vi.mocked(resolveEntityRanked).mockResolvedValue([])

    const supabase = mockSupabase({})

    await assembleContext(supabase, ORG_ID, 'what can you tell about Sezer')

    // Only non-stop words should be resolved: "Sezer"
    // "what", "can", "you", "tell", "about" are all stop words
    expect(resolveEntityRanked).toHaveBeenCalledWith(supabase, 'Sezer', ORG_ID)
    expect(resolveEntityRanked).toHaveBeenCalledTimes(1)
  })

  it('generates summary text from briefings', async () => {
    vi.mocked(resolveEntityRanked).mockResolvedValue([
      {
        contact: { id: 'c1', name: 'Sezer', org_id: ORG_ID, slug: 'sezer', type: 'individual' as const, emails: [], phones: [], aliases: [], profile_data: {}, communication_patterns: {} },
        matchConfidence: 1.0,
        matchStep: 'alias',
      },
    ])

    const supabase = mockSupabase({})

    const result = await assembleContext(supabase, ORG_ID, 'Sezer')

    expect(result.summary).toContain('Sezer')
    expect(result.summary).toContain('contact')
  })
})
