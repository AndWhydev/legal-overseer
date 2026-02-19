import type { ChannelAdapter, ChannelMessage } from './types'

export const outlookAdapter: ChannelAdapter = {
  type: 'outlook',
  name: 'Outlook',
  description: 'Pull emails from Outlook (reads from local cache populated via browser automation)',
  icon: 'Mail',

  async pull(_config, since) {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'outlook-emails.json')

    // Read from local cache file (populated by browser automation or external sync)
    if (!existsSync(cachePath)) {
      return []
    }

    try {
      const raw = readFileSync(cachePath, 'utf-8')
      const emails = JSON.parse(raw) as Array<{
        id: string
        from: string
        fromEmail: string
        subject: string
        body: string
        date: string
      }>

      return emails
        .filter(e => new Date(e.date) >= sinceDate)
        .map((email, i): ChannelMessage => ({
          id: `outlook-${email.id || i}`,
          channel: 'outlook',
          externalId: email.id || `outlook-${i}`,
          sender: email.from || email.fromEmail || 'Unknown',
          senderEmail: email.fromEmail || '',
          subject: email.subject || '(no subject)',
          body: email.body?.slice(0, 2000) || email.subject || '',
          receivedAt: new Date(email.date),
          isActionable: false,
          priority: 'medium',
          metadata: { source: 'outlook-cache' },
        }))
    } catch (err) {
      console.error('Outlook pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    const { existsSync } = await import('fs')
    const { join } = await import('path')
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'outlook-emails.json')
    return existsSync(cachePath)
  },
}
