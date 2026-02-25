import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

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

    await client
      .from('channel_configs')
      .update({
        credentials: {
          ...creds,
          access_token: data.access_token,
          refresh_token: data.refresh_token || creds.refresh_token,
          token_expires_at: expiresAt,
        },
      })
      .eq('org_id', orgId)
      .eq('channel_type', 'gmail')

    return data.access_token
  } catch {
    return null
  }
}

export const gmailAdapter: ChannelAdapter = {
  type: 'gmail',
  name: 'Gmail',
  description: 'Pull emails from Gmail via IMAP',
  icon: 'Mail',

  async pull(_config, since, options) {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_APP_PASSWORD
    if (!user || !pass) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const maxMessages = (options?.maxMessages as number) || 50

    return gmailPullWithRetry(user, pass, sinceDate, maxMessages, 1)
  },

  async isAvailable() {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  },
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
    // Retry once on connection failure
    if (retriesLeft > 0) {
      console.warn('Gmail IMAP pull failed, retrying:', err)
      return gmailPullWithRetry(user, pass, sinceDate, maxMessages, retriesLeft - 1)
    }

    console.error('Gmail IMAP pull failed after retries:', err)
    return []
  }
}
