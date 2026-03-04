import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storeChannelCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Gmail OAuth2 token refresh (for OAuth-based Gmail, alongside IMAP app-password)
// ---------------------------------------------------------------------------

interface GmailOAuthCredentials {
  client_id: string
  client_secret: string
  access_token?: string
  refresh_token?: string
  token_expires_at?: string
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>
}

interface GmailMessageResponse {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
  }
}

function readStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function getHeaderValue(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  return headers?.find((header) => header.name.toLowerCase() === target)?.value
}

function parseFromHeader(value: string | undefined): { sender: string; senderEmail: string } {
  if (!value) {
    return { sender: 'Unknown', senderEmail: '' }
  }

  const emailMatch = value.match(/<([^>]+)>/)
  const senderEmail = (emailMatch?.[1] || value).trim()
  const sender = value
    .replace(/<[^>]+>/g, '')
    .replace(/"/g, '')
    .trim()

  return {
    sender: sender || senderEmail || 'Unknown',
    senderEmail,
  }
}

function formatGmailQueryDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function parseMessageDate(internalDate?: string, headerDate?: string): Date {
  const internal = Number(internalDate)
  if (Number.isFinite(internal) && internal > 0) {
    return new Date(internal)
  }

  if (headerDate) {
    const parsed = new Date(headerDate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return new Date()
}

async function gmailApiFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gmail API ${response.status}: ${text}`)
  }

  return (await response.json()) as T
}

function isGmailTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() - 5 * 60 * 1000 <= Date.now()
}

/**
 * Refresh Gmail OAuth2 token and persist to Supabase channel_configs.
 */
export async function refreshGmailToken(
  client: SupabaseClient,
  orgId: string,
  creds: GmailOAuthCredentials,
): Promise<string | null> {
  if (creds.access_token && !isGmailTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (!creds.refresh_token) return null

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

    if (!res.ok) return null

    const data = (await res.json()) as {
      access_token: string
      expires_in: number
      refresh_token?: string
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

    await storeChannelCredential(client, orgId, 'gmail', {
      ...creds,
      access_token: data.access_token,
      refresh_token: data.refresh_token || creds.refresh_token,
      token_expires_at: expiresAt,
    })

    return data.access_token
  } catch {
    return null
  }
}

/**
 * Gmail channel adapter integrating via IMAP (RFC3501).
 * Pulls emails from INBOX using imapflow library with OAuth2 token refresh support.
 * API: imap.gmail.com:993 (IMAPS)
 */
export const gmailAdapter: ChannelAdapter = {
  type: 'gmail',
  name: 'Gmail',
  description: 'Pull emails from Gmail via API (OAuth) with IMAP fallback',
  icon: 'Mail',

  async pull(config, since, options) {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const maxMessages = (options?.maxMessages as number) || 50

    const accessToken =
      readStringConfig(config, 'accessToken') ||
      readStringConfig(config, 'access_token') ||
      process.env.GMAIL_ACCESS_TOKEN

    if (accessToken) {
      const messages = await gmailApiPullWithRetry(accessToken, sinceDate, maxMessages, 3)
      if (messages) return messages

      console.warn('[gmail] API pull failed after retries; attempting IMAP fallback')
    }

    const user =
      readStringConfig(config, 'user') ||
      readStringConfig(config, 'username') ||
      process.env.GMAIL_USER
    const pass =
      readStringConfig(config, 'appPassword') ||
      readStringConfig(config, 'applicationPassword') ||
      readStringConfig(config, 'password') ||
      process.env.GMAIL_APP_PASSWORD
    if (!user || !pass) return []

    return gmailPullWithRetry(user, pass, sinceDate, maxMessages, 4)
  },

  async isAvailable() {
    return Boolean(
      process.env.GMAIL_ACCESS_TOKEN ||
      (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    )
  },
}

async function gmailApiPullWithRetry(
  accessToken: string,
  sinceDate: Date,
  maxMessages: number,
  retriesLeft: number,
): Promise<ChannelMessage[] | null> {
  try {
    const query = encodeURIComponent(`in:inbox after:${formatGmailQueryDate(sinceDate)}`)
    const cappedMaxMessages = Math.min(Math.max(maxMessages, 1), 100)
    const list = await gmailApiFetch<GmailListResponse>(
      accessToken,
      `/gmail/v1/users/me/messages?maxResults=${cappedMaxMessages}&q=${query}`,
    )

    const items = list.messages || []
    if (items.length === 0) {
      return []
    }

    const detailMessages = await Promise.all(
      items.slice(0, cappedMaxMessages).map(async (item) => {
        try {
          return await gmailApiFetch<GmailMessageResponse>(
            accessToken,
            `/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
          )
        } catch (err) {
          console.warn('[gmail] Failed to fetch message details:', err)
          return null
        }
      }),
    )

    return detailMessages
      .filter((message): message is GmailMessageResponse => !!message)
      .map((message): ChannelMessage => {
        const headers = message.payload?.headers
        const fromHeader = getHeaderValue(headers, 'From')
        const subject = getHeaderValue(headers, 'Subject') || '(no subject)'
        const dateHeader = getHeaderValue(headers, 'Date')
        const messageIdHeader = getHeaderValue(headers, 'Message-ID')
        const { sender, senderEmail } = parseFromHeader(fromHeader)
        const receivedAt = parseMessageDate(message.internalDate, dateHeader)

        return {
          id: `gmail-api-${message.id}`,
          channel: 'gmail',
          externalId: messageIdHeader || message.id,
          sender,
          senderEmail,
          subject,
          body: (message.snippet || subject).slice(0, 2000),
          receivedAt,
          isActionable: false,
          priority: 'medium',
          metadata: {
            gmailId: message.id,
            threadId: message.threadId,
            messageId: messageIdHeader || message.id,
            source: 'gmail-api',
          },
        }
      })
  } catch (err) {
    if (retriesLeft > 1) {
      const attempt = 4 - retriesLeft
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
      console.warn(`[gmail] API pull failed (attempt ${attempt}/3), retrying in ${delay}ms:`, err)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return gmailApiPullWithRetry(accessToken, sinceDate, maxMessages, retriesLeft - 1)
    }

    console.error('[gmail] API pull failed after 3 attempts:', err)
    return null
  }
}

async function gmailPullWithRetry(
  user: string,
  pass: string,
  sinceDate: Date,
  maxMessages: number,
  retriesLeft: number,
): Promise<ChannelMessage[]> {
  try {
    const { ImapFlow } = await import('imapflow')

    // Connection timeout 30 seconds
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
      socketTimeout: 30000,
      connectionTimeout: 30000,
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const messages: ChannelMessage[] = []
      const seenMessageIds = new Set<string>()
      const searchDate = sinceDate.toISOString().split('T')[0]
      let messageCount = 0

      for await (const msg of client.fetch(
        { since: new Date(searchDate) },
        { envelope: true, source: { maxLength: 10000 } },
      )) {
        // Check message limit
        if (messageCount >= maxMessages) {
          break
        }

        const envelope = msg.envelope
        if (!envelope) continue

        // Deduplicate by message ID
        const messageId = envelope.messageId || `gmail-${msg.uid}`
        if (seenMessageIds.has(messageId)) {
          continue
        }
        seenMessageIds.add(messageId)

        const from = envelope.from?.[0]
        const sender = from?.name || from?.address || 'Unknown'
        const senderEmail = from?.address || ''
        const subject = envelope.subject || '(no subject)'
        const date = envelope.date ? new Date(envelope.date) : new Date()

        let body = ''
        if (msg.source) {
          const raw = msg.source.toString()
          const bodyStart = raw.indexOf('\r\n\r\n')
          if (bodyStart !== -1) {
            body = raw
              .slice(bodyStart + 4, bodyStart + 2000)
              .replace(/<[^>]*>/g, '')
              .replace(/=\r?\n/g, '')
              .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
              .trim()
          }
        }

        messages.push({
          id: `gmail-${msg.uid}`,
          channel: 'gmail',
          externalId: messageId,
          sender,
          senderEmail,
          subject,
          body: body.slice(0, 2000) || subject,
          receivedAt: date,
          isActionable: false,
          priority: 'medium',
          metadata: {
            uid: msg.uid,
            messageId: envelope.messageId,
            source: 'gmail-imap',
          },
        })

        messageCount++
      }

      return messages
    } finally {
      lock.release()
      await client.logout()
    }
  } catch (err) {
    if (retriesLeft > 0) {
      const attempt = 5 - retriesLeft // 1, 2, 3, 4
      const baseDelay = 1000 // 1s initial delay
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000) // cap at 30s
      const jitter = Math.random() * delay * 0.1 // 10% jitter
      console.warn(`[gmail] IMAP pull failed (attempt ${attempt}/4), retrying in ${Math.round(delay + jitter)}ms:`, err)
      await new Promise(resolve => setTimeout(resolve, delay + jitter))
      return gmailPullWithRetry(user, pass, sinceDate, maxMessages, retriesLeft - 1)
    }

    console.error('[gmail] IMAP pull failed after 4 attempts:', err)
    return []
  }
}
