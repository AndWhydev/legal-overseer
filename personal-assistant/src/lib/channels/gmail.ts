import type { ChannelAdapter, ChannelMessage } from './types'

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
