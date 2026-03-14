import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storeChannelCredential } from '@/lib/integrations/credentials'
import { logger } from '@/lib/core/logger';

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

type GmailTransportMode = 'auto' | 'api' | 'imap'

function readObjectConfig(
  config: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = config[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function resolveMode(value: unknown): GmailTransportMode | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'api' || normalized === 'imap') {
    return normalized
  }
  return undefined
}

function resolveGmailTransportMode(config: Record<string, unknown>): GmailTransportMode {
  return (
    resolveMode(config.mode) ||
    resolveMode(config.transport) ||
    resolveMode(config.gmailMode) ||
    resolveMode(process.env.GMAIL_MODE) ||
    'auto'
  )
}

function getNestedConfig(config: Record<string, unknown>): Record<string, unknown> | undefined {
  return (
    readObjectConfig(config, 'oauth') ||
    readObjectConfig(config, 'oauthCredentials') ||
    readObjectConfig(config, 'oauth_credential') ||
    readObjectConfig(config, 'credentials')
  )
}

function resolveApiAccessToken(config: Record<string, unknown>): string | undefined {
  const nested = getNestedConfig(config)
  return (
    readStringConfig(config, 'accessToken') ||
    readStringConfig(config, 'access_token') ||
    readStringConfig(config, 'oauthAccessToken') ||
    readStringConfig(config, 'oauth_access_token') ||
    (nested &&
      (readStringConfig(nested, 'accessToken') ||
        readStringConfig(nested, 'access_token') ||
        readStringConfig(nested, 'token'))) ||
    process.env.GMAIL_ACCESS_TOKEN
  )
}

function resolveImapCredentials(config: Record<string, unknown>): { user?: string; pass?: string } {
  const nested = getNestedConfig(config)
  return {
    user:
      readStringConfig(config, 'user') ||
      readStringConfig(config, 'username') ||
      (nested &&
        (readStringConfig(nested, 'user') ||
          readStringConfig(nested, 'username') ||
          readStringConfig(nested, 'email'))) ||
      process.env.GMAIL_USER,
    pass:
      readStringConfig(config, 'appPassword') ||
      readStringConfig(config, 'applicationPassword') ||
      readStringConfig(config, 'password') ||
      (nested &&
        (readStringConfig(nested, 'appPassword') ||
          readStringConfig(nested, 'applicationPassword') ||
          readStringConfig(nested, 'app_password') ||
          readStringConfig(nested, 'password'))) ||
      process.env.GMAIL_APP_PASSWORD,
  }
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

    const updatedCreds = {
      ...creds,
      access_token: data.access_token,
      refresh_token: data.refresh_token || creds.refresh_token,
      token_expires_at: expiresAt,
    }

    // Persist to org_integrations (primary store) then channel_configs (fallback)
    try {
      const { encryptCredential } = await import('@/lib/integrations/credentials')
      const encrypted = encryptCredential(JSON.stringify(updatedCreds))
      await client
        .from('org_integrations')
        .update({ credentials_encrypted: encrypted })
        .eq('org_id', orgId)
        .eq('provider', 'gmail')
    } catch {
      // Fallback to channel_configs
      await storeChannelCredential(client, orgId, 'gmail', updatedCreds)
    }

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
  description: 'Pull emails from Gmail via API (OAuth) with configurable IMAP fallback',
  icon: 'Mail',

  async pull(config, since, options) {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const maxMessages = (options?.maxMessages as number) || 50
    const mode = resolveGmailTransportMode(config)
    const accessToken = resolveApiAccessToken(config)

    if ((mode === 'auto' || mode === 'api') && accessToken) {
      const messages = await gmailApiPullWithRetry(accessToken, sinceDate, maxMessages, 3)
      if (messages) return messages

      if (mode === 'api') {
        logger.warn('[gmail] API-only mode enabled; skipping IMAP fallback after API failure')
        return []
      }

      logger.warn('[gmail] API pull failed after retries; attempting IMAP fallback')
    }

    if (mode === 'api') {
      return []
    }

    const { user, pass } = resolveImapCredentials(config)
    if (!user || !pass) return []

    return gmailPullWithRetry(user, pass, sinceDate, maxMessages, 4)
  },

  async isAvailable() {
    const mode = resolveMode(process.env.GMAIL_MODE) || 'auto'
    const hasApiToken = Boolean(process.env.GMAIL_ACCESS_TOKEN)
    const hasImapCreds = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)

    if (mode === 'api') return hasApiToken
    if (mode === 'imap') return hasImapCreds
    return hasApiToken || hasImapCreds
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
          logger.warn('[gmail] Failed to fetch message details:', err)
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
      logger.warn(`[gmail] API pull failed (attempt ${attempt}/3), retrying in ${delay}ms:`, err)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return gmailApiPullWithRetry(accessToken, sinceDate, maxMessages, retriesLeft - 1)
    }

    logger.error('[gmail] API pull failed after 3 attempts:', err)
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
      logger.warn(`[gmail] IMAP pull failed (attempt ${attempt}/4), retrying in ${Math.round(delay + jitter)}ms:`, err)
      await new Promise(resolve => setTimeout(resolve, delay + jitter))
      return gmailPullWithRetry(user, pass, sinceDate, maxMessages, retriesLeft - 1)
    }

    logger.error('[gmail] IMAP pull failed after 4 attempts:', err)
    return []
  }
}
