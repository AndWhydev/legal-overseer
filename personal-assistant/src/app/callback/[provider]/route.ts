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
        `/dashboard/channels?error=${encodeURIComponent(errorDescription)}`
      )
    }

    if (!code) {
      return NextResponse.redirect(
        '/dashboard/channels?error=No authorization code received'
      )
    }

    // Validate OAuth state to prevent CSRF
    const cookieStore = await cookies()
    const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value
    const codeVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value

    if (!validateOAuthState(state ?? undefined, expectedState)) {
      console.error('OAuth state mismatch — possible CSRF attack', {
        provider,
        hasState: !!state,
        hasExpected: !!expectedState,
      })
      return NextResponse.redirect(
        '/dashboard/channels?error=Invalid OAuth state. Please try connecting again.'
      )
    }

    // Get the authenticated user and org
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(
        '/dashboard/channels?error=Supabase not configured'
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect('/auth/login?error=Not authenticated')
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.redirect(
        '/dashboard/channels?error=No organization found'
      )
    }

    // Exchange code for tokens (with PKCE verifier if available)
    const tokens = await exchangeOAuthCode(provider, code, codeVerifier)

    // Store the credentials in org_integrations
    await storeOrgCredential(
      supabase,
      profile.org_id,
      provider,
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_in: tokens.expires_in || null,
        token_type: 'Bearer',
      },
      user.id
    )

    // Upsert channel_connections row so status API reflects the new connection
    await supabase.from('channel_connections').upsert(
      {
        org_id: profile.org_id,
        channel_type: provider,
        status: 'connected',
        last_sync: null,
        config: {},
        message_count: 0,
      },
      { onConflict: 'org_id,channel_type' }
    )

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `/dashboard/channels?connected=${encodeURIComponent(provider)}`
    )
    response.cookies.delete(OAUTH_STATE_COOKIE)
    response.cookies.delete(OAUTH_VERIFIER_COOKIE)
    return response
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      `/dashboard/channels?error=${encodeURIComponent(errorMessage)}`
    )
  }
}
