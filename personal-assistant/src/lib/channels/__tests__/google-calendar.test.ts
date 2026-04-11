import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  listUserCalendars,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getFreeBusy,
  watchCalendarChanges,
  pullGoogleCalendarEvents,
  getGoogleCalendarCredentials,
} from '../google-calendar'

// Mock the credentials module
vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'

const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = {
  client_id: 'test-client-id',
  client_secret: 'test-client-secret',
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
}

const MOCK_CALENDAR = {
  id: 'primary',
  summary: 'My Calendar',
  description: 'Test calendar',
  timeZone: 'America/New_York',
  primary: true,
}

const MOCK_EVENT = {
  id: 'event-1',
  summary: 'Team Meeting',
  description: 'Weekly sync',
  start: {
    dateTime: '2026-03-10T14:00:00-05:00',
    timeZone: 'America/New_York',
  },
  end: {
    dateTime: '2026-03-10T15:00:00-05:00',
    timeZone: 'America/New_York',
  },
  attendees: [
    {
      email: 'alice@example.com',
      displayName: 'Alice',
      responseStatus: 'accepted',
    },
    {
      email: 'bob@example.com',
      displayName: 'Bob',
      responseStatus: 'tentative',
    },
  ],
  organizer: {
    email: 'me@example.com',
    displayName: 'Me',
  },
  location: 'Conference Room A',
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/calendar/...',
}

describe('listUserCalendars', () => {
  it('returns list of user calendars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [MOCK_CALENDAR],
      }),
    }))

    const result = await listUserCalendars('test-token')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('primary')
    expect(result.items[0].summary).toBe('My Calendar')
  })

  it('handles pagination with nextPageToken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [MOCK_CALENDAR],
        nextPageToken: 'token-123',
      }),
    }))

    const result = await listUserCalendars('test-token')
    expect(result.nextPageToken).toBe('token-123')
  })

  it('throws error when API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))

    await expect(listUserCalendars('invalid-token')).rejects.toThrow('Failed to list calendars')
  })

  it('throws network error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')))

    await expect(listUserCalendars('test-token')).rejects.toThrow('Network timeout')
  })
})

describe('listCalendarEvents', () => {
  it('returns list of events with pagination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [MOCK_EVENT],
      }),
    }))

    const result = await listCalendarEvents(
      'test-token',
      'primary',
      '2026-03-01T00:00:00Z',
      '2026-03-31T23:59:59Z',
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0].summary).toBe('Team Meeting')
    expect(result.items[0].attendees).toHaveLength(2)
  })

  it('handles recurring events with singleEvents expansion', async () => {
    const recurringEvent = {
      ...MOCK_EVENT,
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [recurringEvent],
      }),
    }))

    const result = await listCalendarEvents(
      'test-token',
      'primary',
      '2026-03-01T00:00:00Z',
      '2026-03-31T23:59:59Z',
    )

    expect(result.items[0].recurrence).toBeDefined()
  })

  it('respects maxResults parameter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: Array(50).fill(MOCK_EVENT),
      }),
    }))

    const result = await listCalendarEvents(
      'test-token',
      'primary',
      '2026-03-01T00:00:00Z',
      '2026-03-31T23:59:59Z',
      undefined,
      50,
    )

    expect(result.items).toHaveLength(50)
  })

  it('throws error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }))

    await expect(
      listCalendarEvents('test-token', 'primary', '2026-03-01T00:00:00Z', '2026-03-31T23:59:59Z'),
    ).rejects.toThrow('Failed to list events')
  })
})

describe('createCalendarEvent', () => {
  it('creates a new event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...MOCK_EVENT, id: 'new-event-id' }),
    }))

    const newEvent = {
      summary: 'New Meeting',
      start: { dateTime: '2026-03-20T10:00:00Z' },
      end: { dateTime: '2026-03-20T11:00:00Z' },
    }

    const result = await createCalendarEvent('test-token', 'primary', newEvent)
    expect(result.id).toBe('new-event-id')
    expect(result.summary).toBe('Team Meeting')
  })

  it('throws error on creation failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid event',
    }))

    await expect(
      createCalendarEvent('test-token', 'primary', { summary: 'Invalid' }),
    ).rejects.toThrow('Failed to create event')
  })
})

describe('updateCalendarEvent', () => {
  it('updates an existing event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...MOCK_EVENT, summary: 'Updated Meeting' }),
    }))

    const result = await updateCalendarEvent('test-token', 'primary', 'event-1', {
      summary: 'Updated Meeting',
    })

    expect(result.summary).toBe('Updated Meeting')
  })

  it('throws error on update failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Event not found',
    }))

    await expect(updateCalendarEvent('test-token', 'primary', 'nonexistent', {})).rejects.toThrow(
      'Failed to update event',
    )
  })
})

describe('deleteCalendarEvent', () => {
  it('deletes an event successfully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
    }))

    await expect(deleteCalendarEvent('test-token', 'primary', 'event-1')).resolves.toBeUndefined()
  })

  it('throws error on deletion failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Event not found',
    }))

    await expect(deleteCalendarEvent('test-token', 'primary', 'nonexistent')).rejects.toThrow(
      'Failed to delete event',
    )
  })
})

describe('getFreeBusy', () => {
  it('returns free/busy information for multiple calendars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-03-10T14:00:00Z',
                end: '2026-03-10T15:00:00Z',
              },
            ],
          },
          'secondary@example.com': {
            busy: [
              {
                start: '2026-03-10T15:00:00Z',
                end: '2026-03-10T16:00:00Z',
              },
            ],
          },
        },
      }),
    }))

    const result = await getFreeBusy(
      'test-token',
      ['primary', 'secondary@example.com'],
      '2026-03-01T00:00:00Z',
      '2026-03-31T23:59:59Z',
    )

    expect(result.calendars['primary'].busy).toHaveLength(1)
    expect(result.calendars['secondary@example.com'].busy).toHaveLength(1)
  })

  it('handles calendar errors in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            errors: [
              {
                reason: 'notFound',
                message: 'Calendar not found',
              },
            ],
          },
        },
      }),
    }))

    const result = await getFreeBusy('test-token', ['primary'], '2026-03-01T00:00:00Z', '2026-03-31T23:59:59Z')
    expect(result.calendars['primary'].errors).toHaveLength(1)
  })

  it('throws error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid request',
    }))

    await expect(
      getFreeBusy(
        'test-token',
        ['primary'],
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      ),
    ).rejects.toThrow('Failed to get free/busy')
  })
})

describe('watchCalendarChanges', () => {
  it('sets up webhook watch for calendar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'watch-id-123',
        resourceId: 'resource-id',
        resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary',
        expiration: '2026-06-08T10:00:00Z',
        token: 'channel-token',
      }),
    }))

    const result = await watchCalendarChanges('test-token', 'primary', 'https://webhook.example.com/calendar')
    expect(result.id).toBe('watch-id-123')
    expect(result.resourceId).toBeDefined()
  })

  it('throws error on watch setup failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }))

    await expect(
      watchCalendarChanges('test-token', 'primary', 'https://webhook.example.com/calendar'),
    ).rejects.toThrow('Failed to set watch')
  })
})

describe('getGoogleCalendarCredentials', () => {
  it('returns credentials from org integration', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    const result = await getGoogleCalendarCredentials({} as any, 'org-1')
    expect(result).toEqual(MOCK_CREDS)
  })

  it('returns null when credentials not found', async () => {
    mockGetCreds.mockResolvedValue(null)

    const result = await getGoogleCalendarCredentials({} as any, 'org-1')
    expect(result).toBeNull()
  })
})

describe('pullGoogleCalendarEvents', () => {
  it('pulls events from all user calendars', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calendarList')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [MOCK_CALENDAR],
          }),
        })
      } else if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [MOCK_EVENT],
          }),
        })
      }
      return Promise.resolve({ ok: false })
    }))

    const result = await pullGoogleCalendarEvents({} as any, 'org-1')
    expect(result).toHaveLength(1)
    expect(result[0].subject).toBe('Team Meeting')
    expect(result[0].channel).toBe('calendar')
  })

  it('returns empty array when no credentials found', async () => {
    mockGetCreds.mockResolvedValue(null)

    const result = await pullGoogleCalendarEvents({} as any, 'org-1')
    expect(result).toEqual([])
  })

  it('returns empty array when no calendars found', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
      }),
    }))

    const result = await pullGoogleCalendarEvents({} as any, 'org-1')
    expect(result).toEqual([])
  })

  it('handles errors gracefully and returns empty array', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await pullGoogleCalendarEvents({} as any, 'org-1')
    expect(result).toEqual([])
  })

  it('respects maxResults limit across calendars', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    const events = Array(150)
      .fill(null)
      .map((_, i) => ({
        ...MOCK_EVENT,
        id: `event-${i}`,
      }))

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calendarList')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [MOCK_CALENDAR],
          }),
        })
      } else if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: events.slice(0, 100),
          }),
        })
      }
      return Promise.resolve({ ok: false })
    }))

    const result = await pullGoogleCalendarEvents({} as any, 'org-1', undefined, 100)
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('converts events to proper ChannelMessage format', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calendarList')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [MOCK_CALENDAR],
          }),
        })
      } else if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [MOCK_EVENT],
          }),
        })
      }
      return Promise.resolve({ ok: false })
    }))

    const result = await pullGoogleCalendarEvents({} as any, 'org-1')
    expect(result).toHaveLength(1)

    const msg = result[0]
    expect(msg.id).toMatch(/^gcal-/)
    expect(msg.channel).toBe('calendar')
    expect(msg.externalId).toBe('event-1')
    expect(msg.sender).toBe('Me')
    expect(msg.subject).toBe('Team Meeting')
    expect(msg.metadata.calendarName).toBe('My Calendar')
    expect(msg.metadata.location).toBe('Conference Room A')
    expect(msg.metadata.attendees).toHaveLength(2)
  })
})
