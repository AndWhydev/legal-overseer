import { describe, it, expect, vi } from 'vitest'
import { getBaseplateSnapshot } from './baseplate-snapshot'

describe('getBaseplateSnapshot', () => {
  it('returns cached profile when found', async () => {
    const profileData = {
      recent_events: [{ type: 'message_received', at: '2026-03-10' }],
      relationships: [{ type: 'works_on', target_type: 'task', target_id: 't1' }],
      memories: [{ fact: 'Prefers Slack', confidence: 0.9 }],
      event_summary: { total: 10, channels: ['slack'], last_event_at: '2026-03-10' },
    }

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    profile_data: profileData,
                    computed_at: '2026-03-10T12:00:00Z',
                    valid_until: new Date(Date.now() + 3600000).toISOString(),
                    event_count_at_compute: 10,
                  },
                  error: null,
                })
              })
            })
          })
        })
      })
    } as any

    const result = await getBaseplateSnapshot(mockSupabase, 'org-1', 'contact', 'c-1')
    expect(result).not.toBeNull()
    expect(result!.profile.relationships).toHaveLength(1)
    expect(result!.stale).toBe(false)
    expect(result!.eventCount).toBe(10)
  })

  it('returns null when profile not found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          })
        })
      })
    } as any

    const result = await getBaseplateSnapshot(mockSupabase, 'org-1', 'contact', 'missing')
    expect(result).toBeNull()
  })

  it('marks profile as stale when valid_until has passed', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    profile_data: { recent_events: [], relationships: [], memories: [], event_summary: { total: 0, channels: [], last_event_at: null } },
                    computed_at: '2026-03-09T12:00:00Z',
                    valid_until: '2026-03-09T18:00:00Z',
                    event_count_at_compute: 0,
                  },
                  error: null,
                })
              })
            })
          })
        })
      })
    } as any

    const result = await getBaseplateSnapshot(mockSupabase, 'org-1', 'contact', 'stale')
    expect(result).not.toBeNull()
    expect(result!.stale).toBe(true)
  })
})
