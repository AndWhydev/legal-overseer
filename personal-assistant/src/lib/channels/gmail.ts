import type { ChannelAdapter, ChannelMessage } from './types'

export const gmailAdapter: ChannelAdapter = {
  type: 'gmail',
  name: 'Gmail',
  description: 'Pull emails from Gmail via IMAP',
  icon: 'Mail',

  async pull(_config, since) {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_APP_PASSWORD
    if (!user || !pass) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      const { ImapFlow } = await import('imapflow')

      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user, pass },
        logger: false,
      })

      await client.connect()
      const lock = await client.getMailboxLock('INBOX')

      try {
        const messages: ChannelMessage[] = []
        const searchDate = sinceDate.toISOString().split('T')[0]

        for await (const msg of client.fetch(
          { since: new Date(searchDate) },
          { envelope: true, source: { maxLength: 10000 } }
        )) {
          const envelope = msg.envelope
          if (!envelope) continue

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
              body = raw.slice(bodyStart + 4, bodyStart + 2000)
                .replace(/<[^>]*>/g, '')
                .replace(/=\r?\n/g, '')
                .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .trim()
            }
          }

          messages.push({
            id: `gmail-${msg.uid}`,
            channel: 'gmail',
            externalId: envelope.messageId || `gmail-${msg.uid}`,
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
        }

        return messages
      } finally {
        lock.release()
        await client.logout()
      }
    } catch (err) {
      console.error('Gmail IMAP pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  },
}
