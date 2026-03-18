import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

/**
 * GET /api/portal/auth/callback — Handles magic link callback for portal users
 *
 * 1. Exchanges auth code for session (standard Supabase flow)
 * 2. Links portal_access.user_id to the authenticated user
 * 3. Redirects to portal
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const token = searchParams.get('token')
  const next = searchParams.get('next') || '/portal'

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=not_configured', request.url))
  }

  // Exchange code for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
    }
  }

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=no_user', request.url))
  }

  // If invite token present, activate portal access
  if (token) {
    const serviceClient = getServiceClient()

    // Find the invited portal access record
    const { data: access } = await serviceClient
      .from('portal_access')
      .select('*')
      .eq('invite_token', token)
      .eq('status', 'invited')
      .single()

    if (access) {
      // Activate access and link user
      await serviceClient
        .from('portal_access')
        .update({
          user_id: user.id,
          status: 'active',
          last_login_at: new Date().toISOString(),
        })
        .eq('id', access.id)

      // Ensure user has a profile (portal users may not have one)
      const { data: existingProfile } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingProfile) {
        await serviceClient
          .from('profiles')
          .insert({
            id: user.id,
            org_id: access.org_id,
            display_name: user.email?.split('@')[0] || 'Portal User',
            role: 'member',
            preferences: { is_portal_user: true },
          })
      }
    }
  }

  // Redirect to portal
  return NextResponse.redirect(new URL(next, request.url))
}
