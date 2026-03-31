import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeOAuthCode,
  validateOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from '@/lib/integrations/oauth'
import { storeOrgCredential } from '@/lib/integrations/credentials'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

function buildRedirectUrl(request: Request, path: string) {
  return new URL(path, request.url)
}

function buildCredentialPayload(
  provider: string,
  tokens: {
    access_token: string
    refresh_token?: string
    expires_in?: number
  },
  tokenExpiresAt: string | null,
) {
  const payload: Record<string, unknown> = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_in: tokens.expires_in || null,
    token_expires_at: tokenExpiresAt,
    token_type: 'Bearer',
  }

  if (provider === 'outlook') {
    payload.tenant_id = (process.env.OUTLOOK_TENANT_ID || 'common').trim()
    payload.client_id = (process.env.OUTLOOK_CLIENT_ID || '').trim()
    payload.client_secret = (process.env.OUTLOOK_CLIENT_SECRET || '').trim()
  }

  if (provider === 'gmail') {
    payload.client_id = (process.env.GOOGLE_CLIENT_ID || '').trim()
    payload.client_secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
  }

  return payload
}

function getConnectionChannelType(provider: string): string {
  switch (provider) {
    case 'google-calendar':
      return 'calendar'
    case 'google-analytics':
    case 'ga4':
      return 'gsc'
    default:
      return provider
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || error
      return NextResponse.redirect(
        buildRedirectUrl(
          request,
          `/dashboard/connections?error=${encodeURIComponent(errorDescription)}`,
        ),
      )
    }

    if (!code) {
      return NextResponse.redirect(
        buildRedirectUrl(request, '/dashboard/connections?error=No authorization code received'),
      )
    }

    // Validate OAuth state to prevent CSRF
    const cookieStore = await cookies()
    const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value
    const codeVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value

    if (!validateOAuthState(state ?? undefined, expectedState)) {
      logger.error('OAuth state mismatch — possible CSRF attack', {
        provider,
        hasState: !!state,
        hasExpected: !!expectedState,
      })
      return NextResponse.redirect(
        buildRedirectUrl(
          request,
          '/dashboard/connections?error=Invalid OAuth state. Please try connecting again.',
        ),
      )
    }

    // Get the authenticated user and org
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(
        buildRedirectUrl(request, '/dashboard/connections?error=Supabase not configured'),
      )
    }

    let userId: string
    let orgId: string

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      userId = user.id
      const resolved = await getActiveOrgId(supabase, user.id)
      if (!resolved) {
        return NextResponse.redirect(
          buildRedirectUrl(request, '/dashboard/connections?error=No organization found'),
        )
      }
      orgId = resolved
    } else if (process.env.DEV_BYPASS_AUTH === 'true') {
      // Dev mode: use hardcoded Tor user/org for OAuth callback
      userId = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
      orgId = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
      logger.warn('[oauth-callback] Using dev bypass auth — hardcoded user/org')
    } else {
      return NextResponse.redirect(
        buildRedirectUrl(request, '/auth/login?error=Not authenticated'),
      )
    }

    // Exchange code for tokens — redirect_uri must match what was sent in /start
    const requestOrigin = new URL(request.url).origin
    const tokens = await exchangeOAuthCode(provider, code, codeVerifier, requestOrigin)

    // Compute token_expires_at for the token refresh system
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null

    // Store the credentials in org_integrations
    await storeOrgCredential(
      supabase,
      orgId,
      provider,
      buildCredentialPayload(provider, tokens, tokenExpiresAt),
      userId
    )

    const connectionChannelType = getConnectionChannelType(provider)
    const { data: existingConnection } = await supabase
      .from('channel_connections')
      .select('config, last_sync, message_count')
      .eq('org_id', orgId)
      .eq('channel_type', connectionChannelType)
      .maybeSingle<{
        config?: Record<string, unknown> | null
        last_sync?: string | null
        message_count?: number | null
      }>()

    // Upsert channel_connections row so status API reflects the new connection.
    // Preserve any config fallback written by the credential store on legacy schemas.
    await supabase.from('channel_connections').upsert(
      {
        org_id: orgId,
        channel_type: connectionChannelType,
        status: 'connected',
        relay_enabled: true,
        last_sync: existingConnection?.last_sync ?? null,
        config: existingConnection?.config ?? {},
        message_count: existingConnection?.message_count ?? 0,
      },
      { onConflict: 'org_id,channel_type' }
    )

    // Trigger immediate sync so messages appear without waiting for cron
    try {
      const { pollChannel } = await import('@/lib/channels/relay-daemon')
      const channelType = connectionChannelType as import('@/lib/channels/types').ChannelType
      pollChannel(supabase, orgId, channelType).catch((err: unknown) => {
        logger.warn(`[oauth-callback] Initial sync failed for ${connectionChannelType}:`, err)
      })
    } catch {
      // Non-blocking — cron will pick it up
    }

    // Check if user was mid-onboarding and should return there
    const onboardingActive = cookieStore.get('bb-onboarding-active')?.value === '1'

    const redirectPath = onboardingActive
      ? `/onboard?connected=${encodeURIComponent(provider)}`
      : `/dashboard/connections?connected=${encodeURIComponent(provider)}`

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      buildRedirectUrl(request, redirectPath),
    )
    response.cookies.delete(OAUTH_STATE_COOKIE)
    response.cookies.delete(OAUTH_VERIFIER_COOKIE)

    // Clear the onboarding cookie if it was set
    if (onboardingActive) {
      response.cookies.delete('bb-onboarding-active')
    }

    return response
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('OAuth callback error:', error)
    return NextResponse.redirect(
      buildRedirectUrl(
        request,
        `/dashboard/connections?error=${encodeURIComponent(errorMessage)}`,
      ),
    )
  }
}