import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendlyCredentials {
  access_token: string
  organization_uri?: string
  user_uri?: string
}

export interface CalendlyError {
  error: string
  details?: string
}

export interface CalendlyEventType {
  uri: string
  name: string
  slug: string
  active: boolean
  duration_minutes: number
  scheduling_url: string
  description_plain?: string
}

export interface CalendlyEvent {
  uri: string
  name: string
  status: 'active' | 'canceled'
  start_time: string
  end_time: string
  event_type: string
  location?: { type: string; location?: string; join_url?: string }
  invitees_counter: { total: number; active: number; limit: number }
  created_at: string
  updated_at: string
  organizer?: { name: string; email: string }
}

export interface CalendlyWebhookPayload {
  event: string
  payload: {
    uri: string
    name?: string
    email?: string
    event: string
    scheduled_event?: { uri: string; name: string; start_time: string; end_time: string }
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const CALENDLY_BASE = 'https://api.calendly.com'

async function calendlyFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${CALENDLY_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Calendly API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveCreds(
  client: SupabaseClient,
  orgId: string,
): Promise<CalendlyCredentials | null> {
  return (await getOrgCredential(client, orgId, 'calendly')) as CalendlyCredentials | null
}

async function resolveUserUri(token: string, existing?: string): Promise<string> {
  if (existing) return existing
  const data = await calendlyFetch<{ resource: { uri: string } }>(token, '/users/me')
  return data.resource.uri
}

function extractIdFromUri(uri: string): string {
  return uri.split('/').pop() || uri
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function fetchCalendlyEventTypes(
  client: SupabaseClient,
  orgId: string,
): Promise<CalendlyEventType[] | CalendlyError> {
  try {
    const creds = await resolveCreds(client, orgId)
    if (!creds) return { error: 'No Calendly credentials configured' }

    const userUri = await resolveUserUri(creds.access_token, creds.user_uri)
    const data = await calendlyFetch<{ collection: CalendlyEventType[] }>(
      creds.access_token,
      `/event_types?user=${encodeURIComponent(userUri)}&active=true`,
    )
    return data.collection
  } catch (err) {
    return { error: 'Failed to fetch event types', details: String(err) }
  }
}

export async function fetchCalendlyEvents(
  client: SupabaseClient,
  orgId: string,
  config: {
    minStartTime?: string
    maxStartTime?: string
    status?: string
    count?: number
  } = {},
): Promise<CalendlyEvent[] | CalendlyError> {
  try {
    const creds = await resolveCreds(client, orgId)
    if (!creds) return { error: 'No Calendly credentials configured' }

    const userUri = await resolveUserUri(creds.access_token, creds.user_uri)
    const params = new URLSearchParams({ user: userUri, count: String(config.count || 50) })
    if (config.minStartTime) params.set('min_start_time', config.minStartTime)
    if (config.maxStartTime) params.set('max_start_time', config.maxStartTime)
    if (config.status) params.set('status', config.status)

    const data = await calendlyFetch<{ collection: CalendlyEvent[] }>(
      creds.access_token,
      `/scheduled_events?${params.toString()}`,
    )
    return data.collection
  } catch (err) {
    return { error: 'Failed to fetch events', details: String(err) }
  }
}

export async function createCalendlyBookingLink(
  client: SupabaseClient,
  orgId: string,
  eventTypeId: string,
): Promise<{ booking_url: string } | CalendlyError> {
  try {
    const creds = await resolveCreds(client, orgId)
    if (!creds) return { error: 'No Calendly credentials configured' }

    const data = await calendlyFetch<{ resource: CalendlyEventType }>(
      creds.access_token,
      `/event_types/${eventTypeId}`,
    )
    return { booking_url: data.resource.scheduling_url }
  } catch (err) {
    return { error: 'Failed to create booking link', details: String(err) }
  }
}

export async function registerCalendlyWebhook(
  client: SupabaseClient,
  orgId: string,
  callbackUrl: string,
  events: string[] = ['invitee.created', 'invitee.canceled'],
): Promise<{ uri: string } | CalendlyError> {
  try {
    const creds = await resolveCreds(client, orgId)
    if (!creds) return { error: 'No Calendly credentials configured' }

    const userUri = await resolveUserUri(creds.access_token, creds.user_uri)
    const orgUri = creds.organization_uri

    const data = await calendlyFetch<{ resource: { uri: string } }>(
      creds.access_token,
      '/webhook_subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          url: callbackUrl,
          events,
          organization: orgUri || undefined,
          user: orgUri ? undefined : userUri,
          scope: orgUri ? 'organization' : 'user',
        }),
      },
    )
    return { uri: data.resource.uri }
  } catch (err) {
    return { error: 'Failed to register webhook', details: String(err) }
  }
}

export function parseCalendlyWebhook(body: CalendlyWebhookPayload): CalendlyWebhookPayload {
  return body
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const calendlyAdapter: ChannelAdapter = {
  type: 'calendly',
  name: 'Calendly',
  description: 'Track scheduling and appointments from Calendly',
  icon: 'CalendarClock',

  async pull(config, since) {
    const key = process.env.CALENDLY_API_KEY || process.env.CALENDLY_ACCESS_TOKEN
    if (!key) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      const userUri =
        (config.userUri as string | undefined) || (await resolveUserUri(key))

      const params = new URLSearchParams({
        user: userUri,
        min_start_time: sinceDate.toISOString(),
        count: '100',
        status: 'active',
        sort: 'start_time:asc',
      })

      const events: CalendlyEvent[] = []
      let nextPage: string | null = `${CALENDLY_BASE}/scheduled_events?${params.toString()}`

      while (nextPage) {
        const data: { collection: CalendlyEvent[]; pagination: { next_page?: string | null } } = await calendlyFetch<{
          collection: CalendlyEvent[]
          pagination: { next_page?: string | null }
        }>(key, nextPage)
        events.push(...data.collection)
        nextPage = data.pagination.next_page ?? null
      }

      return events.map((evt): ChannelMessage => {
        const eventId = extractIdFromUri(evt.uri)
        const location =
          evt.location?.join_url || evt.location?.location || evt.location?.type || 'TBD'

        return {
          id: `calendly-${eventId}`,
          channel: 'calendly',
          externalId: evt.uri,
          sender: evt.organizer?.name || 'Calendly',
          senderEmail: evt.organizer?.email,
          subject: evt.name,
          body: [
            `Event: ${evt.name}`,
            `Start: ${new Date(evt.start_time).toLocaleString()}`,
            `End: ${new Date(evt.end_time).toLocaleString()}`,
            `Status: ${evt.status}`,
            `Location: ${location}`,
            `Invitees: ${evt.invitees_counter.active}/${evt.invitees_counter.limit}`,
          ].join('\n'),
          receivedAt: new Date(evt.created_at),
          isActionable: evt.status === 'active',
          priority: 'medium',
          metadata: {
            eventUri: evt.uri,
            eventType: evt.event_type,
            status: evt.status,
            startTime: evt.start_time,
            endTime: evt.end_time,
            location: evt.location,
            inviteesCounter: evt.invitees_counter,
          },
        }
      })
    } catch (err) {
      console.error('[calendly] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.CALENDLY_API_KEY || process.env.CALENDLY_ACCESS_TOKEN)
  },
}
