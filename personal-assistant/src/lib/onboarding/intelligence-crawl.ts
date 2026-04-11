/**
 * Onboarding Intelligence Crawl — Multi-Channel
 *
 * Bulk-fetches data from ALL connected channels for the Opus synthesis pass.
 * Merges Gmail, Outlook, WhatsApp, SMS, Calendar into a unified corpus.
 * Designed to run once at onboarding, not incrementally.
 */

import { logger } from '@/lib/core/logger'
import { getOrgCredential, storeOrgCredential } from '@/lib/integrations/credentials'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrawledMessage {
  id: string
  channel: string // 'gmail' | 'outlook' | 'whatsapp' | 'sms' | 'calendar'
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  direction: 'sent' | 'received' | 'event'
  /** Full message body (if fetched) */
  fullBody?: string
  /** Extracted text from attachments (PDFs, docs) */
  attachmentText?: string
  /** Attachment filenames */
  attachmentNames?: string[]
}

export interface CrawlResult {
  messages: CrawledMessage[]
  channelBreakdown: Record<string, number>
  crawlDurationMs: number
  accountEmail: string
}

export interface CrawlProgress {
  channel: string
  status: 'crawling' | 'done' | 'error' | 'skipped'
  count: number
  error?: string
}

// ─── Main Multi-Channel Crawl ────────────────────────────────────────────────

/**
 * Crawl all connected channels for onboarding synthesis.
 * Calls the progress callback after each channel completes.
 */
export async function crawlAllChannels(
  supabase: SupabaseClient,
  orgId: string,
  opts: {
    monthsBack?: number
    maxPerChannel?: number
    onProgress?: (progress: CrawlProgress) => void
  } = {},
): Promise<CrawlResult> {
  const start = Date.now()
  const monthsBack = opts.monthsBack ?? 6
  const maxPerChannel = opts.maxPerChannel ?? 100
  const onProgress = opts.onProgress ?? (() => {})

  // Get all connected channels
  const { data: connections } = await supabase
    .from('channel_connections')
    .select('channel_type, status, config')
    .eq('org_id', orgId)
    .eq('status', 'connected')

  const connected = new Set((connections ?? []).map(c => c.channel_type))
  let accountEmail = 'unknown'

  logger.info('[intelligence-crawl] Starting multi-channel crawl', {
    orgId, channels: [...connected], monthsBack,
  })

  const allMessages: CrawledMessage[] = []
  const channelBreakdown: Record<string, number> = {}

  // Crawl each channel
  const channelCrawlers: Array<{
    channel: string
    fn: () => Promise<CrawledMessage[]>
  }> = []

  if (connected.has('gmail')) {
    channelCrawlers.push({
      channel: 'gmail',
      fn: async () => {
        const result = await crawlGmail(supabase, orgId, monthsBack, maxPerChannel)
        accountEmail = result.accountEmail
        return result.messages
      },
    })
  }

  if (connected.has('outlook')) {
    channelCrawlers.push({
      channel: 'outlook',
      fn: () => crawlOutlook(supabase, orgId, monthsBack, maxPerChannel),
    })
  }

  // WhatsApp + SMS: pull from channel_messages table (already synced by relay)
  if (connected.has('whatsapp') || connected.has('sms')) {
    channelCrawlers.push({
      channel: 'messaging',
      fn: () => crawlStoredMessages(supabase, orgId, monthsBack, maxPerChannel),
    })
  }

  if (connected.has('calendar')) {
    channelCrawlers.push({
      channel: 'calendar',
      fn: () => crawlCalendar(supabase, orgId, monthsBack),
    })
  }

  // Execute all crawlers in parallel
  const results = await Promise.allSettled(
    channelCrawlers.map(async ({ channel, fn }) => {
      onProgress({ channel, status: 'crawling', count: 0 })
      try {
        const msgs = await fn()
        channelBreakdown[channel] = msgs.length
        onProgress({ channel, status: 'done', count: msgs.length })
        return msgs
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        onProgress({ channel, status: 'error', count: 0, error })
        logger.warn('[intelligence-crawl] Channel crawl failed', { channel, error })
        return [] as CrawledMessage[]
      }
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allMessages.push(...result.value)
    }
  }

  // Sort by date descending (most recent first)
  allMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Report channels that weren't connected
  for (const ch of ['gmail', 'outlook', 'whatsapp', 'sms', 'calendar']) {
    if (!connected.has(ch) && ch !== 'messaging') {
      onProgress({ channel: ch, status: 'skipped', count: 0 })
    }
  }

  logger.info('[intelligence-crawl] Multi-channel crawl complete', {
    orgId, total: allMessages.length, channelBreakdown,
    durationMs: Date.now() - start,
  })

  return {
    messages: allMessages,
    channelBreakdown,
    crawlDurationMs: Date.now() - start,
    accountEmail,
  }
}

// ─── Gmail Crawler ───────────────────────────────────────────────────────────

async function crawlGmail(
  supabase: SupabaseClient,
  orgId: string,
  monthsBack: number,
  maxPerDirection: number,
): Promise<{ messages: CrawledMessage[]; accountEmail: string }> {
  const creds = await getOrgCredential(supabase, orgId, 'gmail')
  if (!creds) throw new Error('No Gmail credentials')

  const clientId = (creds.client_id as string) || process.env.GOOGLE_CLIENT_ID || ''
  const clientSecret = (creds.client_secret as string) || process.env.GOOGLE_CLIENT_SECRET || ''
  let accessToken = creds.access_token as string | undefined
  const refreshToken = creds.refresh_token as string | undefined
  const tokenExpiresAt = creds.token_expires_at as string | undefined

  if (!accessToken && !refreshToken) throw new Error('No Gmail tokens')

  // Refresh if needed
  if (!accessToken || (tokenExpiresAt && new Date(tokenExpiresAt).getTime() - 60000 <= Date.now())) {
    if (!refreshToken) throw new Error('Gmail token expired, no refresh token')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`)
    const data = await res.json() as { access_token: string; expires_in: number }
    accessToken = data.access_token
    await storeOrgCredential(supabase, orgId, 'gmail', {
      ...creds, access_token: accessToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }, 'system')
  }

  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = await profileRes.json() as { emailAddress?: string }
  const accountEmail = profile.emailAddress ?? 'unknown'

  const since = new Date()
  since.setMonth(since.getMonth() - monthsBack)
  const dateStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`

  const [sent, received] = await Promise.all([
    fetchGmailBatch(accessToken!, `in:sent after:${dateStr}`, maxPerDirection, 'sent'),
    fetchGmailBatch(accessToken!, `in:inbox after:${dateStr}`, maxPerDirection, 'received'),
  ])

  // Second pass: fetch full content + attachments for messages that have them
  // Focus on invoices, contracts, and important documents
  const allMsgs = [...sent, ...received]
  const importantWithAttachments = allMsgs.filter(m =>
    m.subject.toLowerCase().match(/invoice|contract|proposal|agreement|receipt|statement|quote/) ||
    m.snippet.toLowerCase().includes('attached') ||
    m.snippet.toLowerCase().includes('pdf')
  ).slice(0, 20) // Max 20 attachment fetches

  if (importantWithAttachments.length > 0 && accessToken) {
    try {
      const { fetchFullGmailMessage, processMessageAttachments } = await import('@/lib/channels/gmail-attachments')
      for (const msg of importantWithAttachments) {
        try {
          const full = await fetchFullGmailMessage(accessToken!, msg.id)
          if (full) {
            msg.fullBody = full.body
            if (full.hasAttachments) {
              const extracted = await processMessageAttachments(accessToken!, msg.id, full.parts)
              if (extracted.length > 0) {
                msg.attachmentText = extracted.map(a => `[${a.filename}]\n${a.extractedText}`).join('\n\n')
                msg.attachmentNames = extracted.map(a => a.filename)
              }
            }
          }
        } catch {} // Individual attachment failures don't block
      }
      logger.info('[intelligence-crawl] Processed attachments', {
        checked: importantWithAttachments.length,
        withText: allMsgs.filter(m => m.attachmentText).length,
      })
    } catch (err) {
      logger.warn('[intelligence-crawl] Attachment processing unavailable', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { messages: allMsgs, accountEmail }
}

async function fetchGmailBatch(
  token: string, query: string, maxResults: number, direction: 'sent' | 'received',
): Promise<CrawledMessage[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!listRes.ok) return []
  const list = await listRes.json() as { messages?: { id: string }[] }
  if (!list.messages?.length) return []

  const messages: CrawledMessage[] = []
  for (let i = 0; i < list.messages.length; i += 10) {
    const batch = list.messages.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(item =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).then(r => r.ok ? r.json() : null)
      )
    )
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue
      const msg = result.value as { id: string; snippet: string; payload: { headers: { name: string; value: string }[] } }
      const h = (n: string) => msg.payload?.headers?.find((hdr: { name: string }) => hdr.name === n)?.value ?? ''
      messages.push({ id: msg.id, channel: 'gmail', from: h('From'), to: h('To'), subject: h('Subject'), date: h('Date'), snippet: msg.snippet, direction })
    }
  }
  return messages
}

// ─── Outlook Crawler ─────────────────────────────────────────────────────────

async function crawlOutlook(
  supabase: SupabaseClient, orgId: string, monthsBack: number, maxPerDirection: number,
): Promise<CrawledMessage[]> {
  const creds = await getOrgCredential(supabase, orgId, 'outlook')
  if (!creds) throw new Error('No Outlook credentials')

  let accessToken = creds.access_token as string | undefined
  const refreshToken = creds.refresh_token as string | undefined
  const tenantId = creds.tenant_id as string || process.env.OUTLOOK_TENANT_ID || ''
  const clientId = creds.client_id as string || process.env.OUTLOOK_CLIENT_ID || ''
  const clientSecret = creds.client_secret as string || process.env.OUTLOOK_CLIENT_SECRET || ''

  // Refresh if needed
  if (!accessToken || !refreshToken) throw new Error('No Outlook tokens')
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/.default offline_access',
    }),
  })
  if (tokenRes.ok) {
    const data = await tokenRes.json() as { access_token: string }
    accessToken = data.access_token
  }

  if (!accessToken) throw new Error('Could not get Outlook access token')

  const since = new Date()
  since.setMonth(since.getMonth() - monthsBack)
  const sinceISO = since.toISOString()

  const messages: CrawledMessage[] = []

  // Fetch inbox + sent
  for (const folder of ['inbox', 'sentitems']) {
    const direction: 'sent' | 'received' = folder === 'sentitems' ? 'sent' : 'received'
    const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview&$top=${maxPerDirection}&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${sinceISO}`

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) continue
    const data = await res.json() as { value?: Array<{ id: string; subject: string; from: { emailAddress: { name: string; address: string } }; toRecipients: Array<{ emailAddress: { address: string } }>; receivedDateTime: string; bodyPreview: string }> }

    for (const msg of data.value ?? []) {
      messages.push({
        id: msg.id,
        channel: 'outlook',
        from: `${msg.from?.emailAddress?.name} <${msg.from?.emailAddress?.address}>`,
        to: msg.toRecipients?.map(r => r.emailAddress?.address).join(', ') ?? '',
        subject: msg.subject ?? '',
        date: msg.receivedDateTime ?? '',
        snippet: msg.bodyPreview ?? '',
        direction,
      })
    }
  }

  return messages
}

// ─── Stored Messages (WhatsApp, SMS) ─────────────────────────────────────────

async function crawlStoredMessages(
  supabase: SupabaseClient, orgId: string, monthsBack: number, maxResults: number,
): Promise<CrawledMessage[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - monthsBack)

  const { data } = await supabase
    .from('channel_messages')
    .select('id, channel, sender, sender_email, subject, body, received_at')
    .eq('org_id', orgId)
    .in('channel', ['whatsapp', 'sms'])
    .gte('received_at', since.toISOString())
    .order('received_at', { ascending: false })
    .limit(maxResults)

  return (data ?? []).map(msg => ({
    id: msg.id,
    channel: msg.channel,
    from: msg.sender ?? msg.sender_email ?? 'unknown',
    to: 'user',
    subject: msg.subject ?? '',
    date: msg.received_at ?? '',
    snippet: (msg.body ?? '').slice(0, 200),
    direction: 'received' as const,
  }))
}

// ─── Calendar Events ─────────────────────────────────────────────────────────

async function crawlCalendar(
  supabase: SupabaseClient, orgId: string, monthsBack: number,
): Promise<CrawledMessage[]> {
  // Pull from stored calendar events or Google Calendar API
  const since = new Date()
  since.setMonth(since.getMonth() - monthsBack)
  const until = new Date()
  until.setMonth(until.getMonth() + 2)

  // Try reading cached Apple Calendar events first
  try {
    const { readFile } = await import('fs/promises')
    const raw = await readFile('/tmp/apple-calendar-cache.json', 'utf-8')
    const events = JSON.parse(raw) as Array<{ title: string; startDate: string; location?: string; calendar?: string }>

    return events.slice(0, 50).map((evt, i) => ({
      id: `cal-${i}`,
      channel: 'calendar',
      from: 'calendar',
      to: 'user',
      subject: evt.title,
      date: evt.startDate,
      snippet: [evt.location, evt.calendar].filter(Boolean).join(' | '),
      direction: 'event' as const,
    }))
  } catch {
    // No cached calendar — skip
    return []
  }
}
