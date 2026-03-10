import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEntityProfile } from './entity-profile-builder'

function createMockSupabase(overrides: any = {}) {
  const mockUpsert = vi.fn().mockReturnValue({ error: null })

  const defaultEvents = {
    data: [
      { event_type: 'message_received', event_data: { body: 'Hello' }, channel_source: 'email', created_at: '2026-03-10T00:00:00Z' },
      { event_type: 'invoice_created', event_data: { amount: 500 }, channel_source: null, created_at: '2026-03-09T00:00:00Z' },
    ],
    error: null,
    count: 2,
  }

  const defaultRelationships = {
    data: [{ from_type: 'contact', from_id: 'contact-1', to_type: 'task', to_id: 't1', relationship_type: 'assigned_to', strength: 1.0 }],
    error: null,
  }

  const defaultMemories = {
    data: [{ fact: 'Prefers email', confidence: 0.9, category: 'preference', created_at: '2026-03-01T00:00:00Z' }],
    error: null,
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'entity_profiles') return { upsert: mockUpsert }
        if (table === 'entity_timeline') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(overrides.events ?? defaultEvents)
                })
              })
            })
          })
        }
        if (table === 'entity_relationships') return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue(overrides.relationships ?? defaultRelationships)
          })
        }
        if (table === 'semantic_memories') return {
          select: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue(overrides.memories ?? defaultMemories)
            })
          })
        }
        return {}
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

  it('does not throw when upsert fails', async () => {
    const { supabase, mockUpsert } = createMockSupabase()
    mockUpsert.mockReturnValueOnce({ error: new Error('db error') })

    await expect(
      computeEntityProfile(supabase, { orgId: 'org-1', entityType: 'contact', entityId: 'c1' })
    ).resolves.not.toThrow()
  })
})
