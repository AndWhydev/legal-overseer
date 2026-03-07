import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential, storeOrgCredential } from '@/lib/integrations/credentials'
import { dispatchNotification } from '@/lib/notifications/dispatcher'

/**
 * OAuth token endpoints per channel.
 */
const TOKEN_ENDPOINTS: Record<string, {
  url: string | ((tenantId?: string) => string)
  scope?: string
}> = {
  gmail: {
    url: 'https://oauth2.googleapis.com/token',
  },
  'google-calendar': {
    url: 'https://oauth2.googleapis.com/token',
  },
  'google-analytics': {
    url: 'https://oauth2.googleapis.com/token',
  },
  ga4: {
    url: 'https://oauth2.googleapis.com/token',
  },
  outlook: {
    url: (tenantId?: string) =>
      `https://login.microsoftonline.com/${tenantId || 'common'}/oauth2/v2.0/token`,
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send offline_access',
  },
  asana: {
    url: 'https://app.asana.com/-/oauth_token',
  },
  calendly: {
    url: 'https://auth.calendly.com/oauth/token',
  },
}

/**
 * Resolve OAuth client credentials from environment variables.
 * These are NOT stored in the database — they come from the app's env config.
 */
function getProviderClientCredentials(channel: string): { clientId: string; clientSecret: string } | null {
  switch (channel) {
    case 'gmail':
    case 'google-calendar':
    case 'google-analytics':
    case 'ga4':
      return {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      }
    case 'outlook':
      return {
        clientId: process.env.OUTLOOK_CLIENT_ID || '',
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
      }
    case 'asana':
      return {
        clientId: process.env.ASANA_CLIENT_ID || '',
        clientSecret: process.env.ASANA_CLIENT_SECRET || '',
      }
    case 'calendly':
      return {
        clientId: process.env.CALENDLY_CLIENT_ID || '',
        clientSecret: process.env.CALENDLY_CLIENT_SECRET || '',
      }
    default:
      return null
  }
}

/** Channels that use OAuth and need token refresh. */
const OAUTH_CHANNELS = ['gmail', 'outlook', 'asana', 'calendly', 'google-calendar', 'google-analytics', 'ga4']

/** Max retry count before marking channel as error (24 hourly checks = 24h grace). */
const MAX_RETRY_COUNT = 24

/** Buffer before expiry to trigger proactive refresh (15 minutes). */
const REFRESH_BUFFER_MS = 15 * 60 * 1000

interface RefreshResult {
  refreshed: boolean
  error?: string
}

interface RefreshAllResult {
  results: Array<{
    orgId: string
    channel: string
    refreshed: boolean
    error?: string
  }>
}

/**
 * Check if a token is within the refresh window (15 minutes before expiry).
 */
function isTokenExpiringSoon(tokenExpiresAt?: string): boolean {
  if (!tokenExpiresAt) return true
  return new Date(tokenExpiresAt).getTime() - REFRESH_BUFFER_MS <= Date.now()
}

function getCredentialLookupOrder(channel: string): string[] {
  if (channel === 'ga4') return ['ga4', 'google-analytics']
  return [channel]
}

function getIntegrationProvider(channel: string): string {
  if (channel === 'ga4') return 'google-analytics'
  return channel
}

/**
 * Refresh a single channel's OAuth token for an organization.
 */
export async function refreshChannelToken(
  supabase: SupabaseClient,
  orgId: string,
  channel: string,
): Promise<RefreshResult> {
  // API key channels don't expire
  if (!OAUTH_CHANNELS.includes(channel)) {
    return { refreshed: false }
  }

  let credentials: Record<string, unknown> | null = null
  for (const provider of getCredentialLookupOrder(channel)) {
    credentials = await getOrgCredential(supabase, orgId, provider)
    if (credentials) break
  }
  if (!credentials) {
    return { refreshed: false, error: 'No credentials found' }
  }

  const tokenExpiresAt = credentials.token_expires_at as string | undefined
  const refreshToken = credentials.refresh_token as string | undefined

  // Token not expiring soon -- no action needed
  if (!isTokenExpiringSoon(tokenExpiresAt)) {
    return { refreshed: false }
  }

  // No refresh token available
  if (!refreshToken) {
    return { refreshed: false, error: 'No refresh token available' }
  }

  // Resolve client credentials from env vars, not stored credentials
  const providerCreds = getProviderClientCredentials(channel)
  if (!providerCreds || !providerCreds.clientId || !providerCreds.clientSecret) {
    return { refreshed: false, error: `Missing OAuth client credentials in environment for ${channel}` }
  }

  const endpointConfig = TOKEN_ENDPOINTS[channel]
  if (!endpointConfig) {
    return { refreshed: false, error: `No token endpoint configured for ${channel}` }
  }

  const tokenUrl = typeof endpointConfig.url === 'function'
    ? endpointConfig.url(credentials.tenant_id as string | undefined)
    : endpointConfig.url

  try {
    const params = new URLSearchParams({
      client_id: providerCreds.clientId,
      client_secret: providerCreds.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    if (endpointConfig.scope) {
      params.set('scope', endpointConfig.scope)
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return await handleRefreshFailure(
        supabase,
        orgId,
        channel,
        credentials,
        `Token refresh failed (${response.status}): ${errorText}`,
      )
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1h

    // Store updated credentials
    const updatedCredentials = {
      ...credentials,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      token_expires_at: expiresAt,
      retry_count: 0, // Reset retry count on success
    }

    await storeOrgCredential(
      supabase,
      orgId,
      getIntegrationProvider(channel),
      updatedCredentials,
      'token-refresh-service',
    )

    logger.info(`[token-refresh] Refreshed ${channel} token for org ${orgId}`)
    return { refreshed: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return await handleRefreshFailure(supabase, orgId, channel, credentials, message)
  }
}

/**
 * Handle a token refresh failure: increment retry count, mark as error after grace period.
 */
async function handleRefreshFailure(
  supabase: SupabaseClient,
  orgId: string,
  channel: string,
  credentials: Record<string, unknown>,
  errorMessage: string,
): Promise<RefreshResult> {
  const retryCount = ((credentials.retry_count as number) || 0) + 1

  logger.warn(
    `[token-refresh] ${channel} refresh failed for org ${orgId} (attempt ${retryCount}/${MAX_RETRY_COUNT}): ${errorMessage}`,
  )

  // Update retry count in credentials metadata
  const updatedCredentials = {
    ...credentials,
    retry_count: retryCount,
  }

  try {
    await storeOrgCredential(
      supabase,
      orgId,
      channel,
      updatedCredentials,
      'token-refresh-service',
    )
  } catch {
    // Best effort -- don't fail the whole operation
  }

  // After grace period (24 retries at hourly checks = 24h), mark as error
  if (retryCount >= MAX_RETRY_COUNT) {
    logger.error(
      `[token-refresh] ${channel} for org ${orgId} exceeded retry limit, marking as error`,
    )

    // Update org_integrations status to error
    await supabase
      .from('org_integrations')
      .update({ status: 'error' })
      .eq('org_id', orgId)
      .eq('provider', getIntegrationProvider(channel))

    // Send email notification to org owner about re-authorization
    try {
      await dispatchNotification(supabase, {
        orgId,
        type: 'alert_escalation',
        title: `${channel.charAt(0).toUpperCase() + channel.slice(1)} connection needs re-authorization`,
        body: `Your ${channel} connection has stopped working and needs to be re-authorized. Visit your dashboard to reconnect: /dashboard/channels`,
        urgency: 'high',
        channels: ['dashboard', 'email'],
        metadata: {
          channel,
          action: 'reauthorize',
          link: '/dashboard/channels',
        },
      })
    } catch (notifyErr) {
      logger.warn('[token-refresh] Failed to send error notification:', notifyErr)
    }
  }

  return { refreshed: false, error: errorMessage }
}

/**
 * Refresh tokens for all connected OAuth channels across all organizations.
 */
export async function refreshAllTokens(
  supabase: SupabaseClient,
): Promise<RefreshAllResult> {
  const { data: integrations, error } = await supabase
    .from('org_integrations')
    .select('org_id, provider')
    .eq('status', 'connected')
    .in('provider', OAUTH_CHANNELS)

  if (error) {
    logger.error('[token-refresh] Failed to query integrations:', error.message)
    return { results: [] }
  }

  const results: RefreshAllResult['results'] = []

  for (const integration of integrations ?? []) {
    const result = await refreshChannelToken(
      supabase,
      integration.org_id,
      integration.provider,
    )

    results.push({
      orgId: integration.org_id,
      channel: integration.provider,
      refreshed: result.refreshed,
      error: result.error,
    })
  }

  const refreshedCount = results.filter(r => r.refreshed).length
  const errorCount = results.filter(r => r.error).length
  logger.info(
    `[token-refresh] Complete: ${refreshedCount} refreshed, ${errorCount} errors, ${results.length} total`,
  )

  return { results }
}
