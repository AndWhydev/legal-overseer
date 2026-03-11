import { describe, it, expect, vi } from 'vitest'
import {
  analyzeContactTiming,
  computeAllContactTimings,
  getNextOptimalWindow,
  type OptimalContactWindow,
} from './contact-timing'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a timeline event at a specific AEST time. */
function makeEvent(
  type: 'message_sent' | 'message_received',
  aestDay: number,
  aestHour: number,
  minuteOffset = 0,
) {
  // AEST = UTC + 10, so subtract 10 hours to get UTC
  const utcHour = aestHour - 10
  const d = new Date('2026-03-01T00:00:00Z')
  // 2026-03-01 is a Sunday (day 0)
  d.setUTCDate(d.getUTCDate() + aestDay)
  d.setUTCHours(utcHour < 0 ? utcHour + 24 : utcHour, minuteOffset, 0, 0)
  if (utcHour < 0) d.setUTCDate(d.getUTCDate() - 1) // rolled back a day

  return {
    id: `evt-${type}-${aestDay}-${aestHour}-${minuteOffset}`,
    event_type: type,
    event_data: {},
    channel_source: 'email',
    occurred_at: d.toISOString(),
    related_entity_id: null,
  }
}

/**
 * Build pairs of sent->received events at a specific AEST hour.
 */
function makePairs(
  aestDay: number,
  aestHour: number,
  count: number,
  responseMinutes: number,
) {
  const events = []
  for (let i = 0; i < count; i++) {
    events.push(makeEvent('message_sent', aestDay, aestHour, i * 2))
    events.push(makeEvent('message_received', aestDay, aestHour, i * 2 + responseMinutes))
  }
  return events
}

/**
 * Build a fluent chain mock that matches Supabase's pattern:
 * supabase.from(table).select(...).eq(...).eq(...).in(...).order(...).limit(...)
 * The final call in the chain returns the resolved value.
 */
function fluentChain(resolvedValue: unknown): any {
  const self: any = {}
  const methods = ['select', 'eq', 'in', 'order', 'limit', 'single', 'update', 'upsert', 'rpc']
  for (const m of methods) {
    self[m] = vi.fn().mockReturnValue(self)
  }
  // Make awaitable: when await is called, resolve to the value
  self.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    return Promise.resolve(resolvedValue).then(resolve, reject)
  }
  return self
}

function mockSupabaseForTimeline(events: unknown[]) {
  return {
    from: vi.fn(() => fluentChain({ data: events, error: null })),
  } as any
}

function mockSupabaseForTimelineError() {
  return {
    from: vi.fn(() => fluentChain({ data: null, error: { message: 'connection failed' } })),
  } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('analyzeContactTiming', () => {
  it('correctly identifies optimal windows from paired message data', async () => {
    const mondayPairs = makePairs(1, 9, 6, 15) // Monday 9am, 15min response
    const wednesdayPairs = makePairs(3, 15, 6, 45) // Wednesday 3pm, 45min response

    const allEvents = [...mondayPairs, ...wednesdayPairs].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    )

    const supabase = mockSupabaseForTimeline(allEvents)
    const result = await analyzeContactTiming(supabase, 'org-1', 'contact-1')

    expect(result.contactId).toBe('contact-1')
    expect(result.windows.length).toBe(2)
    expect(result.totalEvents).toBe(allEvents.length)

    // Best window (Monday 9am) should be first (lowest avg response time)
    // Note: greedy pairing means sent:0->recv:15 (15min), sent:2->recv:15 (13min), etc.
    // Average = (15+13+11+9+7+5)/6 = 10
    expect(result.windows[0].dayOfWeek).toBe(1) // Monday
    expect(result.windows[0].hourStart).toBe(9)
    expect(result.windows[0].avgResponseMinutes).toBe(10)
    expect(result.windows[0].sampleSize).toBe(6)

    // Second window (Wednesday 3pm) — similarly greedy pairing
    // sent:0->recv:45 (45min), sent:2->recv:45 (43min), etc.
    // Average = (45+43+41+39+37+35)/6 = 40
    expect(result.windows[1].dayOfWeek).toBe(3) // Wednesday
    expect(result.windows[1].hourStart).toBe(15)
    expect(result.windows[1].avgResponseMinutes).toBe(40)
    expect(result.windows[1].sampleSize).toBe(6)
  })

  it('handles insufficient data gracefully (< 10 events)', async () => {
    const fewEvents = [
      makeEvent('message_sent', 1, 9),
      makeEvent('message_received', 1, 9, 10),
    ]

    const supabase = mockSupabaseForTimeline(fewEvents)
    const result = await analyzeContactTiming(supabase, 'org-1', 'contact-2')

    expect(result.contactId).toBe('contact-2')
    expect(result.windows).toEqual([])
    expect(result.totalEvents).toBe(2)
  })

  it('handles contacts with no messages', async () => {
    const supabase = mockSupabaseForTimeline([])
    const result = await analyzeContactTiming(supabase, 'org-1', 'contact-empty')

    expect(result.contactId).toBe('contact-empty')
    expect(result.windows).toEqual([])
    expect(result.totalEvents).toBe(0)
  })

  it('filters out windows with fewer than 5 data points', async () => {
    const mondayPairs = makePairs(1, 9, 3, 20) // Only 3 samples
    const tuesdayPairs = makePairs(2, 10, 6, 30) // 6 samples
    const fillerEvents = [
      makeEvent('message_sent', 4, 12),
      makeEvent('message_received', 4, 12, 5),
    ]

    const allEvents = [...mondayPairs, ...tuesdayPairs, ...fillerEvents].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    )

    const supabase = mockSupabaseForTimeline(allEvents)
    const result = await analyzeContactTiming(supabase, 'org-1', 'contact-3')

    // Only Tuesday window should appear (Monday has < 5 samples)
    expect(result.windows.length).toBe(1)
    expect(result.windows[0].dayOfWeek).toBe(2)
    expect(result.windows[0].sampleSize).toBe(6)
  })

  it('handles database errors gracefully', async () => {
    const supabase = mockSupabaseForTimelineError()
    const result = await analyzeContactTiming(supabase, 'org-1', 'contact-error')

    expect(result.contactId).toBe('contact-error')
    expect(result.windows).toEqual([])
    expect(result.totalEvents).toBe(0)
  })
})

describe('getNextOptimalWindow', () => {
  it('returns null when no windows exist', () => {
    expect(getNextOptimalWindow([])).toBeNull()
  })

  it('selects the correct next window for a given time', () => {
    const windows: OptimalContactWindow[] = [
      { dayOfWeek: 1, hourStart: 9, hourEnd: 10, avgResponseMinutes: 15, sampleSize: 10 },
      { dayOfWeek: 3, hourStart: 14, hourEnd: 15, avgResponseMinutes: 25, sampleSize: 8 },
    ]

    // Saturday 00:00 AEST = Friday 14:00 UTC
    const saturdayAESTStart = new Date('2026-03-06T14:00:00Z')
    const result = getNextOptimalWindow(windows, saturdayAESTStart)

    expect(result).not.toBeNull()
    // Monday 9am AEST = Sunday 23:00 UTC
    expect(result!.getUTCHours()).toBe(23)
  })

  it('skips to next week if best window has already passed', () => {
    const windows: OptimalContactWindow[] = [
      { dayOfWeek: 1, hourStart: 9, hourEnd: 10, avgResponseMinutes: 15, sampleSize: 10 },
    ]

    // Monday 3pm AEST = Monday 05:00 UTC
    const mondayAfternoonUTC = new Date('2026-03-09T05:00:00Z')
    const result = getNextOptimalWindow(windows, mondayAfternoonUTC)

    expect(result).not.toBeNull()
    // Next Monday 9am AEST = Sunday March 15 23:00 UTC
    const expectedDate = new Date('2026-03-15T23:00:00Z')
    expect(result!.getTime()).toBe(expectedDate.getTime())
  })

  it('handles AEST timezone correctly for midnight edge case', () => {
    const windows: OptimalContactWindow[] = [
      { dayOfWeek: 0, hourStart: 0, hourEnd: 1, avgResponseMinutes: 10, sampleSize: 5 },
    ]

    // Saturday 20:00 AEST = Saturday 10:00 UTC
    const saturdayUTC = new Date('2026-03-07T10:00:00Z')
    const result = getNextOptimalWindow(windows, saturdayUTC)

    expect(result).not.toBeNull()
    // Sunday midnight AEST = Saturday 14:00 UTC
    expect(result!.getUTCHours()).toBe(14)
  })
})

describe('computeAllContactTimings (batch)', () => {
  it('processes contacts and stores results', async () => {
    const goodPairs = makePairs(1, 9, 6, 15)
    const morePairs = makePairs(2, 10, 6, 20)
    const allEvents = [...goodPairs, ...morePairs].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    )

    const mockPatternUpsert = vi.fn().mockReturnValue({ error: null })

    // Build a mock that handles different tables and method chains
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      from: vi.fn((table: string) => {
        if (table === 'contacts') {
          const contactChain = fluentChain({ data: [{ id: 'contact-A' }], error: null })
          // Override update to also be chainable
          contactChain.update = vi.fn().mockReturnValue(
            fluentChain({ error: null })
          )
          // Override select to handle both list and single reads
          const origSelect = contactChain.select
          contactChain.select = vi.fn().mockReturnValue({
            eq: vi.fn((col: string) => {
              if (col === 'org_id') {
                return Promise.resolve({ data: [{ id: 'contact-A' }], error: null })
              }
              // Single contact pattern read
              return {
                single: vi.fn().mockResolvedValue({
                  data: { communication_patterns: {} },
                  error: null,
                }),
              }
            }),
          })
          return contactChain
        }
        if (table === 'entity_timeline') {
          return fluentChain({ data: allEvents, error: null })
        }
        if (table === 'entity_patterns') {
          return { upsert: mockPatternUpsert }
        }
        return fluentChain({ data: null, error: null })
      }),
    } as any

    const result = await computeAllContactTimings(supabase, 'org-1')

    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
    expect(result.results.length).toBe(1)
    expect(result.results[0].contactId).toBe('contact-A')
    expect(result.results[0].windows.length).toBeGreaterThan(0)
    expect(mockPatternUpsert).toHaveBeenCalled()
  })
})
