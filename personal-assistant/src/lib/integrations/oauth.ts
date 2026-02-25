import { URLSearchParams } from 'url'

interface OAuthProvider {
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
}

const PROVIDERS: Record<string, OAuthProvider> = {
  asana: {
    clientId: process.env.ASANA_CLIENT_ID || '',
    clientSecret: process.env.ASANA_CLIENT_SECRET || '',
    authorizationUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    scopes: [
      'default',
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
    ],
  },
  'google-calendar': {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  'google-analytics': {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics',
    ],
  },
  calendly: {
    clientId: process.env.CALENDLY_CLIENT_ID || '',
    clientSecret: process.env.CALENDLY_CLIENT_SECRET || '',
    authorizationUrl: 'https://auth.calendly.com/oauth/authorize',
    tokenUrl: 'https://auth.calendly.com/oauth/token',
    scopes: ['calendar:read', 'calendar:write', 'events:read', 'events:write'],
  },
}

/**
 * Get the OAuth redirect URL for a provider
 */
export function getOAuthRedirectUrl(provider: string, state?: string): string {
  const config = PROVIDERS[provider.toLowerCase()]
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }

  if (!config.clientId) {
    throw new Error(`OAuth client ID not configured for ${provider}`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/callback/${provider}`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: state || generateRandomState(),
  })

  return `${config.authorizationUrl}?${params.toString()}`
}

/**
 * Exchange OAuth code for tokens
 */
export async function exchangeOAuthCode(
  provider: string,
  code: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const config = PROVIDERS[provider.toLowerCase()]
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }

  if (!config.clientSecret) {
    throw new Error(`OAuth client secret not configured for ${provider}`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/callback/${provider}`

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: 'authorization_code',
  })

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(
      `OAuth token exchange failed: ${response.status} - ${errorData}`
    )
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return data
}

/**
 * Generate a random state string for OAuth security
 */
function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(
  state: string | undefined,
  expectedState: string | undefined
): boolean {
  if (!state || !expectedState) {
    return false
  }
  return state === expectedState
}
