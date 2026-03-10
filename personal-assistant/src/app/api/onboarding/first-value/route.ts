import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

interface FirstValueData {
  type: 'email' | 'calendar' | 'generic'
  headline: string
  detail: string
  source: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ value: null })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ value: null }, { status: 401 })

    let orgId: string | null = null
    try {
      orgId = await getActiveOrgId(supabase, user.id)
    } catch {
      return NextResponse.json({ value: null })
    }
    if (!orgId) return NextResponse.json({ value: null })

    const { data: connections } = await supabase
      .from('channel_connections')
      .select('channel, status')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .limit(5)

    if (!connections?.length) {
      return NextResponse.json({ value: null })
    }

    const connectedChannels = connections.map(c => c.channel)

    // Try Gmail first
    if (connectedChannels.includes('gmail')) {
      try {
        const { data: creds } = await supabase
          .from('channel_connections')
          .select('credentials')
          .eq('org_id', orgId)
          .eq('channel', 'gmail')
          .eq('status', 'active')
          .single()

        const accessToken = (creds?.credentials as Record<string, unknown>)?.access_token
        if (accessToken && typeof accessToken === 'string') {
          const res = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in:inbox',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (res.ok) {
            const data = await res.json()
            if (data.messages?.[0]) {
              const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              )
              if (msgRes.ok) {
                const msg = await msgRes.json()
                const subject = msg.payload?.headers?.find((h: { name: string }) => h.name === 'Subject')?.value || 'No subject'
                const from = msg.payload?.headers?.find((h: { name: string }) => h.name === 'From')?.value || 'Unknown'
                const senderName = from.split('<')[0].trim().replace(/"/g, '')
                return NextResponse.json({
                  value: {
                    type: 'email',
                    headline: subject.slice(0, 80),
                    detail: `From ${senderName}`,
                    source: 'Gmail',
                  } satisfies FirstValueData
                })
              }
            }
          }
        }
      } catch (e) {
        logger.warn('[first-value] Gmail fetch failed, trying next source', { error: String(e) })
      }
    }

    // Try Google Calendar
    if (connectedChannels.includes('calendar') || connectedChannels.includes('google-calendar')) {
      try {
        const channelName = connectedChannels.includes('google-calendar') ? 'google-calendar' : 'calendar'
        const { data: creds } = await supabase
          .from('channel_connections')
          .select('credentials')
          .eq('org_id', orgId)
          .eq('channel', channelName)
          .eq('status', 'active')
          .single()

        const accessToken = (creds?.credentials as Record<string, unknown>)?.access_token
        if (accessToken && typeof accessToken === 'string') {
          const now = new Date().toISOString()
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&timeMin=${now}&orderBy=startTime&singleEvents=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (res.ok) {
            const data = await res.json()
            if (data.items?.[0]) {
              const event = data.items[0]
              const start = event.start?.dateTime || event.start?.date || ''
              const when = start ? new Date(start).toLocaleString('en-AU', {
                weekday: 'short', hour: 'numeric', minute: '2-digit'
              }) : ''
              return NextResponse.json({
                value: {
                  type: 'calendar',
                  headline: event.summary || 'Untitled event',
                  detail: when ? `Coming up ${when}` : 'Upcoming',
                  source: 'Google Calendar',
                } satisfies FirstValueData
              })
            }
          }
        }
      } catch (e) {
        logger.warn('[first-value] Calendar fetch failed', { error: String(e) })
      }
    }

    // Fallback
    return NextResponse.json({
      value: {
        type: 'generic',
        headline: `${connections.length} source${connections.length > 1 ? 's' : ''} connected`,
        detail: 'BitBit is ready to start learning your world',
        source: connectedChannels.join(', '),
      } satisfies FirstValueData
    })
  } catch (error) {
    logger.error('[first-value] Unexpected error', { error: String(error) })
    return NextResponse.json({ value: null })
  }
}
