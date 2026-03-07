import { URLSearchParams } from 'url'
import crypto from 'crypto'
import { getAppUrl } from '@/lib/core/app-url'

interface OAuthProvider {
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  supportsPKCE?: boolean
}

const PROVIDERS: Record<string, OAuthProvider> = {
  gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    supportsPKCE: true,
  },
  outlook: {
    clientId: process.env.OUTLOOK_CLIENT_ID || '',
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'offline_access',
    ],
    supportsPKCE: true,
  },
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
    supportsPKCE: true,
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
    supportsPKCE: true,
  },
  calendly: {
    clientId: process.env.CALENDLY_CLIENT_ID || '',
    clientSecret: process.env.CALENDLY_CLIENT_SECRET || '',
    authorizationUrl: 'https://auth.calendly.com/oauth/authorize',
    tokenUrl: 'https://auth.calendly.com/oauth/token',
    scopes: ['calendar:read', 'calendar:write', 'events:read', 'events:write'],
  },
}

// OAuth state cookie name
export const OAUTH_STATE_COOKIE = 'oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'oauth_code_verifier'

/**
 * Generate a cryptographically secure state string
 */
export function generateOAuthState(): string {
  return crypto.randomUUID()
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  return { codeVerifier, codeChallenge }
}

/**
 * Get the OAuth redirect URL for a provider.
 * Returns the URL, the generated state, and optionally the PKCE code_verifier
 * (which the caller must persist in a cookie for validation on callback).
 */
export function getOAuthRedirectUrl(provider: string): {
  url: string
  state: string
  codeVerifier?: string
} {
  const config = PROVIDERS[provider.toLowerCase()]
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }

  if (!config.clientId) {
    throw new Error(`OAuth client ID not configured for ${provider}`)
  }

  const appUrl = getAppUrl()
  const redirectUri = `${appUrl}/callback/${provider}`

  const state = generateOAuthState()

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  })

  // Provider-specific params
  const providerKey = provider.toLowerCase()
  if (providerKey === 'gmail') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  }

  let codeVerifier: string | undefined
  if (config.supportsPKCE) {
    const pkce = generatePKCE()
    codeVerifier = pkce.codeVerifier
    params.set('code_challenge', pkce.codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  return {
    url: `${config.authorizationUrl}?${params.toString()}`,
    state,
    codeVerifier,
  }
}

/**
 * Exchange OAuth code for tokens, optionally with PKCE code_verifier
 */
export async function exchangeOAuthCode(
  provider: string,
  code: string,
  codeVerifier?: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const config = PROVIDERS[provider.toLowerCase()]
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }

  if (!config.clientSecret) {
    throw new Error(`OAuth client secret not configured for ${provider}`)
  }

  const appUrl = getAppUrl()
  const redirectUri = `${appUrl}/callback/${provider}`

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: 'authorization_code',
  })

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier)
  }

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
 * Validate OAuth state parameter (constant-time comparison)
 */
export function validateOAuthState(
  state: string | undefined,
  expectedState: string | undefined
): boolean {
  if (!state || !expectedState) {
    return false
  }
  if (state.length !== expectedState.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
}
