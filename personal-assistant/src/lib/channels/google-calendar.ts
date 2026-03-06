import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleCalendarCredentials {
  client_id: string
  client_secret: string
  access_token?: string
  refresh_token?: string
  token_expires_at?: string
}

interface GoogleCalendar {
  id: string
  summary: string
  description?: string
  timeZone?: string
  primary?: boolean
}

interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  organizer?: { email: string; displayName?: string }
  location?: string
  recurrence?: string[]
  status?: string
  htmlLink?: string
  created?: string
  updated?: string
}

interface GoogleCalendarsListResponse {
  items: GoogleCalendar[]
  nextPageToken?: string
}

interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEvent[]
  nextPageToken?: string
}

interface GoogleFreeBusyRequest {
  timeMin: string
  timeMax: string
  items: Array<{ id: string }>
}

interface GoogleFreeBusyResponse {
  calendars: Record<
    string,
    {
      busy?: Array<{ start: string; end: string }>
      errors?: Array<{ reason: string; message: string }>
    }
  >
}

interface GoogleWatchResponse {
  id: string
  resourceId: string
  resourceUri: string
  expiration?: string
  token?: string
}

export interface GoogleCalendarConfig {
  calendarId?: string
  maxResults?: number
  timeMin?: string
  timeMax?: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() - 5 * 60 * 1000 <= Date.now()
}

export async function getGoogleCalendarCredentials(
  client: SupabaseClient,
  orgId: string,
): Promise<GoogleCalendarCredentials | null> {
  const creds = await getOrgCredential(client, orgId, 'google-calendar')
  if (!creds) return null

  return {
    client_id: (creds.client_id as string) || '',
    client_secret: (creds.client_secret as string) || '',
    access_token: creds.access_token as string | undefined,
    refresh_token: creds.refresh_token as string | undefined,
    token_expires_at: creds.token_expires_at as string | undefined,
  }
}

async function refreshGoogleToken(
  client: SupabaseClient,
  orgId: string,
  creds: GoogleCalendarCredentials,
): Promise<string | null> {
  if (creds.access_token && !isTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (!creds.refresh_token) {
    console.warn('[google-calendar] No refresh token available')
    return null
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) {
      console.warn(`[google-calendar] Token refresh failed: ${res.status}`)
      return null
    }

    const data = (await res.json()) as {
      access_token: string
      expires_in: number
      refresh_token?: string
    }

    // Token refresh is handled by the centralized token-refresh service
    // This function returns the new token for immediate use
    return data.access_token
  } catch (err) {
    console.warn('[google-calendar] Token refresh error:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Calendar listing
// ---------------------------------------------------------------------------

export async function listUserCalendars(
  accessToken: string,
  pageToken?: string,
): Promise<GoogleCalendarsListResponse> {
  const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList')
  url.searchParams.set('maxResults', '250')
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken)
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to list calendars (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleCalendarsListResponse
}

// ---------------------------------------------------------------------------
// Event operations
// ---------------------------------------------------------------------------

export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  pageToken?: string,
  maxResults: number = 100,
): Promise<GoogleCalendarEventsResponse> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  if (pageToken) {
    url.searchParams.set('pageToken', pageToken)
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to list events (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleCalendarEventsResponse
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: Partial<GoogleCalendarEvent>,
): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to create event (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleCalendarEvent
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to update event (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleCalendarEvent
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to delete event (${res.status}): ${errorText}`)
  }
}

// ---------------------------------------------------------------------------
// Free/busy checking
// ---------------------------------------------------------------------------

export async function getFreeBusy(
  accessToken: string,
  calendars: string[],
  timeMin: string,
  timeMax: string,
): Promise<GoogleFreeBusyResponse> {
  const url = 'https://www.googleapis.com/calendar/v3/freeBusy'

  const payload: GoogleFreeBusyRequest = {
    timeMin,
    timeMax,
    items: calendars.map(id => ({ id })),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to get free/busy (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleFreeBusyResponse
}

// ---------------------------------------------------------------------------
// Webhook watching
// ---------------------------------------------------------------------------

export async function watchCalendarChanges(
  accessToken: string,
  calendarId: string,
  webhookUrl: string,
): Promise<GoogleWatchResponse> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/watch`

  const payload = {
    id: `bitbit-watch-${calendarId}-${Date.now()}`,
    type: 'web_hook',
    address: webhookUrl,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to set watch (${res.status}): ${errorText}`)
  }

  return (await res.json()) as GoogleWatchResponse
}

// ---------------------------------------------------------------------------
// Helper to convert Google Calendar event to ChannelMessage
// ---------------------------------------------------------------------------

function googleEventToChannelMessage(
  event: GoogleCalendarEvent,
  calendarName: string,
  calendarId: string,
): ChannelMessage {
  const startDate = event.start?.dateTime ? new Date(event.start.dateTime) : new Date(event.start?.date || new Date())
  const endDate = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(event.end?.date || new Date())

  const attendeeNames = event.attendees?.map(a => a.displayName || a.email).join(', ') || ''
  const organizer = event.organizer?.displayName || event.organizer?.email || 'Unknown'

  const body = [
    event.description || '',
    event.location ? `Location: ${event.location}` : '',
    attendeeNames ? `Attendees: ${attendeeNames}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: `gcal-${calendarId}-${event.id}`,
    channel: 'calendar',
    externalId: event.id,
    sender: organizer,
    subject: event.summary || '(no title)',
    body: body.slice(0, 2000) || `${startDate.toISOString()} to ${endDate.toISOString()}`,
    receivedAt: startDate,
    isActionable: false,
    priority: 'medium',
    metadata: {
      calendarId,
      calendarName,
      eventId: event.id,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      location: event.location,
      attendees: event.attendees || [],
      recurrence: event.recurrence,
      htmlLink: event.htmlLink,
      status: event.status,
    },
  }
}

// ---------------------------------------------------------------------------
// Channel adapter implementation
// ---------------------------------------------------------------------------

export const googleCalendarAdapter: ChannelAdapter = {
  type: 'calendar',
  name: 'Google Calendar',
  description: 'Sync events from Google Calendar via API',
  icon: 'CalendarDays',

  async pull(config, since, options) {
    // This is called via the synthesizer
    // Real pull logic happens in external services that have org context
    console.warn('[google-calendar] pull() called on adapter (should use org-aware functions instead)')
    return []
  },

  async isAvailable() {
    // Check if Google OAuth credentials are configured
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  },
}

// ---------------------------------------------------------------------------
// High-level org-aware pull function
// ---------------------------------------------------------------------------

export async function pullGoogleCalendarEvents(
  client: SupabaseClient,
  orgId: string,
  since?: Date,
  maxResults: number = 100,
): Promise<ChannelMessage[]> {
  try {
    const creds = await getGoogleCalendarCredentials(client, orgId)
    if (!creds) {
      console.warn(`[google-calendar] No credentials for org ${orgId}`)
      return []
    }

    let accessToken = creds.access_token
    if (!accessToken || isTokenExpired(creds.token_expires_at)) {
      const newToken = await refreshGoogleToken(client, orgId, creds)
      if (!newToken) {
        console.warn(`[google-calendar] Failed to get valid token for org ${orgId}`)
        return []
      }
      accessToken = newToken
    }

    // List all calendars for this user
    const calendarsResponse = await listUserCalendars(accessToken)
    const calendars = calendarsResponse.items || []

    if (calendars.length === 0) {
      console.info(`[google-calendar] No calendars found for org ${orgId}`)
      return []
    }

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const timeMin = sinceDate.toISOString()
    const timeMax = futureDate.toISOString()

    const messages: ChannelMessage[] = []
    let processedEvents = 0

    // Pull events from each calendar
    for (const calendar of calendars) {
      try {
        let pageToken: string | undefined

        do {
          const eventsResponse = await listCalendarEvents(
            accessToken,
            calendar.id,
            timeMin,
            timeMax,
            pageToken,
            Math.min(maxResults - processedEvents, 100),
          )

          const events = eventsResponse.items || []

          for (const event of events) {
            if (processedEvents >= maxResults) {
              break
            }

            const msg = googleEventToChannelMessage(event, calendar.summary || 'Calendar', calendar.id)
            messages.push(msg)
            processedEvents++
          }

          pageToken = eventsResponse.nextPageToken
        } while (pageToken && processedEvents < maxResults)

        if (processedEvents >= maxResults) {
          break
        }
      } catch (err) {
        console.warn(`[google-calendar] Failed to pull events from calendar ${calendar.id}:`, err)
        // Continue with next calendar
      }
    }

    return messages
  } catch (err) {
    console.error('[google-calendar] Pull failed:', err)
    return []
  }
}
