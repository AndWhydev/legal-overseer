import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  fetchCalendlyEventTypes,
  fetchCalendlyEvents,
  createCalendlyBookingLink,
  registerCalendlyWebhook,
  parseCalendlyWebhook,
} from '../calendly'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = {
  access_token: 'cal-token',
  user_uri: 'https://api.calendly.com/users/test-user',
  organization_uri: 'https://api.calendly.com/organizations/test-org',
}

describe('fetchCalendlyEventTypes', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await fetchCalendlyEventTypes({} as any, 'org-1')
    expect(result).toHaveProperty('error')
  })

  it('fetches event types', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: [
          { uri: 'et-1', name: '30 Min Meeting', slug: '30-min', active: true, duration_minutes: 30, scheduling_url: 'https://calendly.com/test/30-min' },
        ],
      }),
    }))

    const result = await fetchCalendlyEventTypes({} as any, 'org-1')
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[])[0].name).toBe('30 Min Meeting')
  })
})

describe('fetchCalendlyEvents', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await fetchCalendlyEvents({} as any, 'org-1')
    expect(result).toHaveProperty('error')
  })

  it('fetches scheduled events', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: [
          {
            uri: 'ev-1',
            name: 'Strategy call',
            status: 'active',
            start_time: '2026-03-01T10:00:00Z',
            end_time: '2026-03-01T10:30:00Z',
            event_type: 'et-1',
            invitees_counter: { total: 1, active: 1, limit: 1 },
            created_at: '2026-02-25T10:00:00Z',
            updated_at: '2026-02-25T10:00:00Z',
          },
        ],
      }),
    }))

    const result = await fetchCalendlyEvents({} as any, 'org-1')
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[])[0].name).toBe('Strategy call')
  })
})

describe('createCalendlyBookingLink', () => {
  it('returns booking URL for event type', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resource: { scheduling_url: 'https://calendly.com/test/30-min' },
      }),
    }))

    const result = await createCalendlyBookingLink({} as any, 'org-1', 'et-1')
    expect(result).toHaveProperty('booking_url', 'https://calendly.com/test/30-min')
  })
})

describe('registerCalendlyWebhook', () => {
  it('registers webhook subscription', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resource: { uri: 'https://api.calendly.com/webhook_subscriptions/wh-1' },
      }),
    }))

    const result = await registerCalendlyWebhook({} as any, 'org-1', 'https://hook.example.com')
    expect(result).toHaveProperty('uri')
  })
})

describe('parseCalendlyWebhook', () => {
  it('passes through webhook payload', () => {
    const payload = {
      event: 'invitee.created',
      payload: {
        uri: 'https://api.calendly.com/invitees/inv-1',
        name: 'Alice',
        email: 'alice@test.com',
        event: 'https://api.calendly.com/events/ev-1',
      },
    }
    const result = parseCalendlyWebhook(payload)
    expect(result.event).toBe('invitee.created')
    expect(result.payload.name).toBe('Alice')
  })
})
