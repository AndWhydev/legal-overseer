import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeOAuthCode } from '@/lib/integrations/oauth'
import { storeOrgCredential } from '@/lib/integrations/credentials'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || error
      return NextResponse.redirect(
        `/dashboard/settings?error=${encodeURIComponent(errorDescription)}`
      )
    }

    if (!code) {
      return NextResponse.redirect(
        '/dashboard/settings?error=No authorization code received'
      )
    }

    // Get the authenticated user and org
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.redirect(
        '/dashboard/settings?error=Supabase not configured'
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
        '/dashboard/settings?error=No organization found'
      )
    }

    // Exchange code for tokens
    const tokens = await exchangeOAuthCode(provider, code)

    // Store the credentials
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

    // Redirect back to settings with success
    return NextResponse.redirect(
      `/dashboard/settings?connected=${encodeURIComponent(provider)}`
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      `/dashboard/settings?error=${encodeURIComponent(errorMessage)}`
    )
  }
}
