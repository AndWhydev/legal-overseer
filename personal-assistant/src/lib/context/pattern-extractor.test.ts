import { describe, it, expect, vi } from 'vitest'
import { extractPaymentPattern, extractActivityFrequency, extractChannelPreference } from './pattern-extractor'

/** Build a chainable Supabase mock that resolves to the given data at the terminal call. */
function mockSb(data: unknown[], terminalMethod = 'order') {
  // Create a proxy that returns itself for any chained method, except the terminal one
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === terminalMethod) {
        return vi.fn().mockResolvedValue({ data, error: null })
      }
      return vi.fn().mockReturnValue(new Proxy({}, handler))
    },
  }
  return new Proxy({}, handler) as any
}

describe('extractPaymentPattern', () => {
  it('computes average payment days from created→paid event pairs', async () => {
    const sb = mockSb([
      { event_type: 'invoice_created', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-01T00:00:00Z' },
      { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-03T00:00:00Z' },
      { event_type: 'invoice_created', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-01T00:00:00Z' },
      { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-04T00:00:00Z' },
    ])

    const result = await extractPaymentPattern(sb, 'org-1', 'contact-1')
    expect(result).not.toBeNull()
    expect(result!.patternType).toBe('payment_timing')
    expect(result!.data.avg_days).toBe(2.5)
    expect(result!.sampleCount).toBe(2)
    expect(result!.confidence).toBeGreaterThan(0.5)
  })

  it('returns null with fewer than 2 event pairs', async () => {
    const sb = mockSb([], 'order')
    const result = await extractPaymentPattern(sb, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })
})

describe('extractActivityFrequency', () => {
  it('computes weekly rate and trend from timeline events', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    // 10 events over the last 20 days — all recent
    const events = Array.from({ length: 10 }, (_, i) => ({
      created_at: new Date(now - (i * 2) * day).toISOString(),
    }))

    const sb = mockSb(events)
    const result = await extractActivityFrequency(sb, 'org-1', 'contact-1')

    expect(result).not.toBeNull()
    expect(result!.patternType).toBe('activity_frequency')
    expect(result!.data.events_per_week).toBeGreaterThan(0)
    expect(result!.data.trend).toBe('increasing') // all in last 30d, none in prior 30d
    expect(result!.data.most_active_day).toBeDefined()
    expect(typeof result!.data.most_active_hour).toBe('number')
    expect(result!.sampleCount).toBe(10)
  })

  it('detects decreasing trend when prior period has more events', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    // 2 events in last 30d, 8 events in prior 30d
    const events = [
      { created_at: new Date(now - 5 * day).toISOString() },
      { created_at: new Date(now - 10 * day).toISOString() },
      ...Array.from({ length: 8 }, (_, i) => ({
        created_at: new Date(now - (35 + i * 3) * day).toISOString(),
      })),
    ]

    const sb = mockSb(events)
    const result = await extractActivityFrequency(sb, 'org-1', 'contact-1')

    expect(result).not.toBeNull()
    expect(result!.data.trend).toBe('decreasing')
    expect(result!.data.recent_30d).toBe(2)
    expect(result!.data.prior_30d).toBe(8)
  })

  it('detects stable trend when periods are similar', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    // 5 events in last 30d, 5 events in prior 30d
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: new Date(now - (5 + i * 5) * day).toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: new Date(now - (35 + i * 5) * day).toISOString(),
      })),
    ]

    const sb = mockSb(events)
    const result = await extractActivityFrequency(sb, 'org-1', 'contact-1')

    expect(result).not.toBeNull()
    expect(result!.data.trend).toBe('stable')
  })

  it('returns null with fewer than 3 events', async () => {
    const sb = mockSb([
      { created_at: '2026-01-01T00:00:00Z' },
      { created_at: '2026-01-02T00:00:00Z' },
    ])
    const result = await extractActivityFrequency(sb, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })

  it('returns null with no timeline events', async () => {
    const sb = mockSb([])
    const result = await extractActivityFrequency(sb, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })
})

describe('extractChannelPreference', () => {
  it('identifies primary and secondary channels', async () => {
    const sb = mockSb([
      { event_type: 'message_received', channel_source: 'whatsapp', created_at: '2026-03-01T10:00:00Z' },
      { event_type: 'message_sent', channel_source: 'whatsapp', created_at: '2026-03-01T09:00:00Z' },
      { event_type: 'message_received', channel_source: 'whatsapp', created_at: '2026-02-28T10:00:00Z' },
      { event_type: 'message_received', channel_source: 'email', created_at: '2026-02-27T10:00:00Z' },
      { event_type: 'message_sent', channel_source: 'email', created_at: '2026-02-26T10:00:00Z' },
    ])

    const result = await extractChannelPreference(sb, 'org-1', 'contact-1')

    expect(result).not.toBeNull()
    expect(result!.patternType).toBe('channel_preference')
    expect(result!.data.primary_channel).toBe('whatsapp')
    expect(result!.data.secondary_channel).toBe('email')
    expect(result!.data.channel_stats).toBeDefined()
    expect((result!.data.channel_stats as Record<string, unknown>)['whatsapp']).toBeDefined()
    expect(result!.data.response_rates).toBeDefined()
    expect(result!.sampleCount).toBe(5)
  })

  it('handles single channel correctly', async () => {
    const sb = mockSb([
      { event_type: 'message_received', channel_source: 'sms', created_at: '2026-03-01T10:00:00Z' },
      { event_type: 'message_sent', channel_source: 'sms', created_at: '2026-02-28T10:00:00Z' },
      { event_type: 'message_received', channel_source: 'sms', created_at: '2026-02-27T10:00:00Z' },
    ])

    const result = await extractChannelPreference(sb, 'org-1', 'contact-1')

    expect(result).not.toBeNull()
    expect(result!.data.primary_channel).toBe('sms')
    expect(result!.data.secondary_channel).toBeNull()
    const rates = result!.data.response_rates as Record<string, number>
    expect(rates['sms']).toBeCloseTo(0.67, 1) // 2 inbound / 3 total
  })

  it('returns null with no channel events', async () => {
    const sb = mockSb([])
    const result = await extractChannelPreference(sb, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })

  it('returns null with only 1 event', async () => {
    const sb = mockSb([
      { event_type: 'message_received', channel_source: 'email', created_at: '2026-03-01T10:00:00Z' },
    ])
    const result = await extractChannelPreference(sb, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })
})
