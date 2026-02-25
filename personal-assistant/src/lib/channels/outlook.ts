import type { ChannelAdapter, ChannelMessage } from './types'

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('scope', 'https://graph.microsoft.com/.default')
  params.append('grant_type', 'client_credentials')

  const response = await fetch(url, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })

  if (!response.ok) {
    throw new Error(`Failed to get MS Graph access token: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.access_token
}

export const outlookAdapter: ChannelAdapter = {
  type: 'outlook',
  name: 'Outlook',
  description: 'Pull emails from Outlook via Microsoft Graph API',
  icon: 'Mail',

  async pull(_config, since) {
    const tenantId = process.env.OUTLOOK_TENANT_ID
    const clientId = process.env.OUTLOOK_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
    const userId = process.env.OUTLOOK_USER_ID // Usually the user's UPN (email address)

    if (!tenantId || !clientId || !clientSecret || !userId) {
      console.warn('Outlook adapter missing credentials in environment')
      return []
    }

    try {
      const accessToken = await getAccessToken(tenantId, clientId, clientSecret)
      const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      // Filter by received date
      const filter = `$filter=receivedDateTime ge ${sinceDate.toISOString()}`
      const select = `$select=id,conversationId,sender,subject,bodyPreview,body,receivedDateTime,isRead`
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/messages?${filter}&${select}&$top=50&$orderby=receivedDateTime desc`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Prefer': 'outlook.body-content-type="text"'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const messages: ChannelMessage[] = []

      for (const msg of data.value || []) {
        const senderName = msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown'
        const senderEmail = msg.sender?.emailAddress?.address || ''
        const subject = msg.subject || '(no subject)'
        const date = msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date()

        // Grab the text body from Microsoft, fallback to bodyPreview or subject
        const bodyContent = msg.body?.content || msg.bodyPreview || subject

        messages.push({
          id: `outlook-${msg.id}`,
          channel: 'outlook',
          externalId: msg.conversationId || `outlook-${msg.id}`,
          sender: senderName,
          senderEmail,
          subject,
          body: bodyContent.slice(0, 2000).trim() || subject,
          receivedAt: date,
          isActionable: false,
          priority: 'medium',
          metadata: {
            messageId: msg.id,
            conversationId: msg.conversationId,
            isRead: msg.isRead
          }
        })
      }

      return messages
    } catch (err) {
      console.error('Outlook Graph API pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(
      process.env.OUTLOOK_TENANT_ID &&
      process.env.OUTLOOK_CLIENT_ID &&
      process.env.OUTLOOK_CLIENT_SECRET &&
      process.env.OUTLOOK_USER_ID
    )
  }
}
