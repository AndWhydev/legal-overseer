import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutlookTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface GraphMessage {
  id: string
  conversationId?: string
  sender?: { emailAddress?: { name?: string; address?: string } }
  subject?: string
  bodyPreview?: string
  body?: { content?: string; contentType?: string }
  receivedDateTime?: string
  isRead?: boolean
}

interface GraphMessagesResponse {
  value: GraphMessage[]
  '@odata.nextLink'?: string
}

export interface OutlookConfig {
  maxMessages?: number
  userId?: string
  folderName?: string
}

interface OutlookCredentials {
  tenant_id?: string
  client_id?: string
  client_secret?: string
  access_token?: string
  refresh_token?: string
  token_expires_at?: string
}

export interface OutlookError {
  error: string
  details?: string
}

interface WebhookSubscription {
  id: string
  resource: string
  expirationDateTime: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function resolveOAuthConfig(creds: OutlookCredentials) {
  const tenantId = creds.tenant_id || process.env.OUTLOOK_TENANT_ID || 'common'
  const clientId = creds.client_id || process.env.OUTLOOK_CLIENT_ID || ''
  const clientSecret = creds.client_secret || process.env.OUTLOOK_CLIENT_SECRET || ''

  if (!clientId || !clientSecret) {
    throw new Error('Missing Outlook OAuth client configuration')
  }

  return { tenantId, clientId, clientSecret }
}

async function getClientCredentialsToken(creds: OutlookCredentials): Promise<string> {
  const { tenantId, clientId, clientSecret } = resolveOAuthConfig(creds)
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(url, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MS token exchange failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OutlookTokenResponse
  return data.access_token
}

async function refreshAccessToken(creds: OutlookCredentials): Promise<OutlookTokenResponse> {
  if (!creds.refresh_token) throw new Error('No refresh token available')

  const { tenantId, clientId, clientSecret } = resolveOAuthConfig(creds)
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send',
  })

  const res = await fetch(url, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  return (await res.json()) as OutlookTokenResponse
}

/**
 * Check if an access token is expired or about to expire (5-min buffer).
 * `token_expires_at` is stored as ISO string in channel_configs.
 */
function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true
  const bufferMs = 5 * 60 * 1000
  return new Date(expiresAt).getTime() - bufferMs <= Date.now()
}

/**
 * Resolve a valid access token, refreshing if expired and persisting new tokens
 * back to Supabase channel_configs.
 */
export async function resolveAccessToken(
  creds: OutlookCredentials,
  client?: SupabaseClient,
  orgId?: string,
): Promise<string> {
  const accessTokenLooksUsable = Boolean(creds.access_token) && !creds.token_expires_at

  // If we have a non-expired access token, use it directly
  if (creds.access_token && !isTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (accessTokenLooksUsable && creds.access_token) {
    return creds.access_token
  }

  // Try refresh flow
  if (creds.refresh_token) {
    try {
      const tokens = await refreshAccessToken(creds)

      // Persist refreshed tokens to Supabase
      if (client && orgId) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        await client
          .from('channel_configs')
          .update({
            credentials: {
              ...creds,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token || creds.refresh_token,
              token_expires_at: expiresAt,
            },
          })
          .eq('org_id', orgId)
          .eq('channel_type', 'outlook')
      }

      return tokens.access_token
    } catch (err) {
      logger.warn('Outlook token refresh failed:', err)
    }
  }

  if (creds.access_token && !isTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  return getClientCredentialsToken(creds)
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

async function graphFetch<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph API ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function fetchOutlookMessages(
  client: SupabaseClient,
  orgId: string,
  config: OutlookConfig = {},
): Promise<ChannelMessage[] | OutlookError> {
  try {
    const creds = (await getOrgCredential(client, orgId, 'outlook')) as OutlookCredentials | null
    if (!creds) return { error: 'No Outlook credentials configured for this organization' }

    const token = await resolveAccessToken(creds, client, orgId)
    const userId = config.userId || 'me'
    const maxMessages = config.maxMessages || 50

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const filter = `receivedDateTime ge ${since}`
    const select = 'id,conversationId,sender,subject,bodyPreview,body,receivedDateTime,isRead'
    const userPath = userId === 'me' ? 'me' : `users/${encodeURIComponent(userId)}`
    const url = `https://graph.microsoft.com/v1.0/${userPath}/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${maxMessages}&$orderby=receivedDateTime desc`

    const data = await graphFetch<GraphMessagesResponse>(token, url, {
      headers: { Prefer: 'outlook.body-content-type="text"' },
    })

    return (data.value || []).map((msg): ChannelMessage => ({
      id: `outlook-${msg.id}`,
      channel: 'outlook',
      externalId: msg.conversationId || `outlook-${msg.id}`,
      sender: msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown',
      senderEmail: msg.sender?.emailAddress?.address || '',
      subject: msg.subject || '(no subject)',
      body: (msg.body?.content || msg.bodyPreview || '').slice(0, 2000).trim(),
      receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
      isActionable: false,
      priority: 'medium',
      metadata: { messageId: msg.id, conversationId: msg.conversationId, isRead: msg.isRead },
    }))
  } catch (err) {
    return { error: 'Failed to fetch Outlook messages', details: String(err) }
  }
}

export async function sendOutlookMessage(
  client: SupabaseClient,
  orgId: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ success: boolean } | OutlookError> {
  try {
    const creds = (await getOrgCredential(client, orgId, 'outlook')) as OutlookCredentials | null
    if (!creds) return { error: 'No Outlook credentials configured' }

    const token = await resolveAccessToken(creds, client, orgId)

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Send failed (${res.status})`, details: text }
    }

    return { success: true }
  } catch (err) {
    return { error: 'Failed to send Outlook message', details: String(err) }
  }
}

export async function createOutlookWebhookSubscription(
  client: SupabaseClient,
  orgId: string,
  notificationUrl: string,
): Promise<WebhookSubscription | OutlookError> {
  try {
    const creds = (await getOrgCredential(client, orgId, 'outlook')) as OutlookCredentials | null
    if (!creds) return { error: 'No Outlook credentials configured' }

    const token = await resolveAccessToken(creds, client, orgId)
    const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    return await graphFetch<WebhookSubscription>(token, 'https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl,
        resource: 'me/mailFolders/inbox/messages',
        expirationDateTime: expiration,
        clientState: `bitbit-${orgId}`,
      }),
    })
  } catch (err) {
    return { error: 'Failed to create webhook subscription', details: String(err) }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const outlookAdapter: ChannelAdapter = {
  type: 'outlook',
  name: 'Outlook',
  description: 'Pull emails from Outlook via Microsoft Graph API',
  icon: 'Mail',

  async pull(_config, since) {
    const tenantId = process.env.OUTLOOK_TENANT_ID
    const clientId = process.env.OUTLOOK_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
    const userId = process.env.OUTLOOK_USER_ID

    if (!tenantId || !clientId || !clientSecret || !userId) return []

    try {
      const token = await getClientCredentialsToken({
        tenant_id: tenantId,
        client_id: clientId,
        client_secret: clientSecret,
      })
      const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const filter = `receivedDateTime ge ${sinceDate.toISOString()}`
      const select = 'id,conversationId,sender,subject,bodyPreview,body,receivedDateTime,isRead'
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=50&$orderby=receivedDateTime desc`

      const data = await graphFetch<GraphMessagesResponse>(token, url, {
        headers: { Prefer: 'outlook.body-content-type="text"' },
      })

      return (data.value || []).map((msg): ChannelMessage => ({
        id: `outlook-${msg.id}`,
        channel: 'outlook',
        externalId: msg.conversationId || `outlook-${msg.id}`,
        sender: msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown',
        senderEmail: msg.sender?.emailAddress?.address || '',
        subject: msg.subject || '(no subject)',
        body: (msg.body?.content || msg.bodyPreview || '').slice(0, 2000).trim(),
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
        isActionable: false,
        priority: 'medium',
        metadata: { messageId: msg.id, conversationId: msg.conversationId, isRead: msg.isRead },
      }))
    } catch (err) {
      logger.error('Outlook Graph API pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(
      process.env.OUTLOOK_TENANT_ID &&
      process.env.OUTLOOK_CLIENT_ID &&
      process.env.OUTLOOK_CLIENT_SECRET &&
      process.env.OUTLOOK_USER_ID,
    )
  },
}
