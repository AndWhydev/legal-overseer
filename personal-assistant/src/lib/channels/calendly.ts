import type { ChannelAdapter, ChannelMessage } from './types'

const CALENDLY_API_BASE = 'https://api.calendly.com'

interface CalendlyEvent {
  uri: string
  name: string
  status: string
  start_time: string
  end_time: string
  created_at: string
  updated_at: string
  event_type: string
  invitees_counter: {
    total: number
    active: number
    limit: number
  }
  location?: {
    type: string
    location?: string
    join_url?: string
  }
  organizer?: {
    name: string
    email: string
  }
}

interface CalendlyPagination {
  count: number
  next_page?: string | null
  next_page_token?: string | null
  previous_page?: string | null
}

interface CalendlyResponse<T> {
  collection: T[]
  pagination: CalendlyPagination
}

function getHeaders(): HeadersInit {
  const key = process.env.CALENDLY_API_KEY
  if (!key) throw new Error('CALENDLY_API_KEY env var not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function getCurrentUserUri(): Promise<string> {
  const res = await fetch(`${CALENDLY_API_BASE}/users/me`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Calendly GET /users/me failed: ${res.status}`)
  const json = await res.json()
  return json.resource.uri as string
}

function extractIdFromUri(uri: string): string {
  return uri.split('/').pop() || uri
}

export const calendlyAdapter: ChannelAdapter = {
  type: 'calendly',
  name: 'Calendly',
  description: 'Pull scheduled events from Calendly',
  icon: 'Calendar',

  async pull(config, since) {
    const key = process.env.CALENDLY_API_KEY
    if (!key) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      // Resolve the user/org URI — prefer config, else fetch from API
      const userUri = (config.userUri as string | undefined) || await getCurrentUserUri()

      const params = new URLSearchParams({
        user: userUri,
        min_start_time: sinceDate.toISOString(),
        count: '100',
        status: 'active',
        sort: 'start_time:asc',
      })

      const events: CalendlyEvent[] = []
      let nextPage: string | null = `${CALENDLY_API_BASE}/scheduled_events?${params.toString()}`

      while (nextPage) {
        const res = await fetch(nextPage, { headers: getHeaders() })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Calendly GET /scheduled_events failed: ${res.status} ${text}`)
        }
        const json: CalendlyResponse<CalendlyEvent> = await res.json()
        events.push(...json.collection)
        nextPage = json.pagination.next_page ?? null
      }

      return events.map((event): ChannelMessage => {
        const eventId = extractIdFromUri(event.uri)
        const organizer = event.organizer
        const location = event.location?.join_url || event.location?.location || event.location?.type || 'TBD'

        const body = [
          `Event: ${event.name}`,
          `Start: ${new Date(event.start_time).toLocaleString()}`,
          `End: ${new Date(event.end_time).toLocaleString()}`,
          `Status: ${event.status}`,
          `Location: ${location}`,
          `Invitees: ${event.invitees_counter.active}/${event.invitees_counter.limit}`,
        ].join('\n')

        return {
          id: `calendly-${eventId}`,
          channel: 'calendly',
          externalId: event.uri,
          sender: organizer?.name || 'Calendly',
          senderEmail: organizer?.email,
          subject: event.name,
          body,
          receivedAt: new Date(event.created_at),
          isActionable: true,
          priority: 'medium',
          metadata: {
            eventUri: event.uri,
            eventType: event.event_type,
            status: event.status,
            startTime: event.start_time,
            endTime: event.end_time,
            location: event.location,
            inviteesCounter: event.invitees_counter,
          },
        }
      })
    } catch (err) {
      console.error('[calendly] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.CALENDLY_API_KEY)
  },
}
