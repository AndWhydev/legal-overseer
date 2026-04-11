import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEntityProfile } from './entity-profile-builder'

/** Build a deeply chainable mock where every method returns itself, and resolves to `value` when awaited */
function chain(value: any): any {
  const obj: any = {}
  const p = Promise.resolve(value)
  obj.then = (a: any, b: any) => p.then(a, b)
  return new Proxy(obj, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return vi.fn().mockReturnValue(chain(value))
    },
  })
}

function createMockSupabase(overrides: any = {}) {
  const mockUpsert = vi.fn().mockReturnValue({ error: null })
  let profilesCallCount = 0
  let timelineCallCount = 0

  const defaultEvents = {
    data: [
      { event_type: 'message_received', event_data: { body: 'Hello' }, channel_source: 'email', created_at: '2026-03-10T00:00:00Z' },
      { event_type: 'invoice_created', event_data: { amount: 500 }, channel_source: null, created_at: '2026-03-09T00:00:00Z' },
    ],
    error: null,
    count: 2,
  }

  const defaultRelationships = {
    data: [{ entity_a_type: 'contact', entity_a_id: 'contact-1', entity_b_type: 'task', entity_b_id: 't1', relationship_type: 'assigned_to', strength: 1.0 }],
    error: null,
  }

  const defaultMemories = {
    data: [{ content: 'Prefers email', confidence: 0.9, category: 'preference', created_at: '2026-03-01T00:00:00Z' }],
    error: null,
  }

  // Staleness check: no existing profile by default → always recompute
  const stalenessResult = overrides.existingProfile ?? { data: null, error: null }
  // Event count for staleness check
  const countResult = overrides.eventCount ?? { count: 5, error: null }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'entity_profiles') {
          profilesCallCount++
          if (profilesCallCount === 1) {
            // Staleness check: .select().eq().eq().eq().maybeSingle()
            return chain(stalenessResult)
          }
          return { upsert: mockUpsert }
        }
        if (table === 'entity_timeline') {
          timelineCallCount++
          if (timelineCallCount === 1) {
            // Staleness count: .select('id', { count, head }).eq().eq()
            return chain(countResult)
          }
          // Data fetch: .select(..., { count }).eq().eq().order().limit()
          return chain(overrides.events ?? defaultEvents)
        }
        if (table === 'entity_relationships') return chain(overrides.relationships ?? defaultRelationships)
        if (table === 'semantic_memories') return chain(overrides.memories ?? defaultMemories)
        return chain({ data: null, error: null })
      }),
    } as any,
    mockUpsert,
  }
}

describe('computeEntityProfile', () => {
  it('computes and upserts a profile from timeline + relationships + memories', async () => {
    const { supabase, mockUpsert } = createMockSupabase()

    await computeEntityProfile(supabase, {
      orgId: 'org-1',
      entityType: 'contact',
      entityId: 'contact-1',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        entity_type: 'contact',
        entity_id: 'contact-1',
        profile_data: expect.objectContaining({
          recent_events: expect.any(Array),
          relationships: expect.any(Array),
          memories: expect.any(Array),
          event_summary: expect.objectContaining({
            total: 2,
            channels: expect.arrayContaining(['email']),
          }),
        }),
        event_count_at_compute: 2,
      }),
      expect.objectContaining({ onConflict: 'org_id,entity_type,entity_id' })
    )
  })

  it('handles empty data gracefully', async () => {
    const { supabase, mockUpsert } = createMockSupabase({
      events: { data: [], error: null, count: 0 },
      relationships: { data: [], error: null },
      memories: { data: [], error: null },
    })

    await computeEntityProfile(supabase, {
      orgId: 'org-1',
      entityType: 'contact',
      entityId: 'empty-contact',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_data: expect.objectContaining({
          recent_events: [],
          relationships: [],
          memories: [],
          event_summary: { total: 0, channels: [], last_event_at: null },
        }),
      }),
      expect.anything()
    )
  })

  it('skips recomputation when no new events since last compute', async () => {
    const { supabase, mockUpsert } = createMockSupabase({
      existingProfile: { data: { event_count_at_compute: 5 }, error: null },
      eventCount: { count: 5, error: null },
    })

    await computeEntityProfile(supabase, {
      orgId: 'org-1',
      entityType: 'contact',
      entityId: 'contact-1',
    })

    // Profile should NOT be recomputed — upsert should not be called
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('recomputes when new events exist since last compute', async () => {
    const { supabase, mockUpsert } = createMockSupabase({
      existingProfile: { data: { event_count_at_compute: 2 }, error: null },
      eventCount: { count: 5, error: null },  // 5 > 2, so stale
    })

    await computeEntityProfile(supabase, {
      orgId: 'org-1',
      entityType: 'contact',
      entityId: 'contact-1',
    })

    expect(mockUpsert).toHaveBeenCalled()
  })

  it('does not throw when upsert fails', async () => {
    const { supabase, mockUpsert } = createMockSupabase()
    mockUpsert.mockReturnValueOnce({ error: new Error('db error') })

    await expect(
      computeEntityProfile(supabase, { orgId: 'org-1', entityType: 'contact', entityId: 'c1' })
    ).resolves.not.toThrow()
  })
})
