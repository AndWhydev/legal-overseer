import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { isSupportedEmailOtpType, resolveSafeAuthRedirect } from '@/lib/auth/callback'
import { buildLoginErrorRedirect } from '@/lib/auth/login-redirect'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = resolveSafeAuthRedirect(url.searchParams.get('next'), url.origin)

  if (
    tokenHash &&
    isSupportedEmailOtpType(type) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const redirectUrl = `${url.origin}${next}`
    const response = NextResponse.redirect(redirectUrl)

    // Create a Supabase client that writes auth cookies directly onto the redirect response
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error, data } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (!error) {
      // If this is a portal redirect, activate portal access
      if (next.startsWith('/portal') && data?.user) {
        await supabase
          .from('portal_access')
          .update({
            user_id: data.user.id,
            status: 'active',
            last_login_at: new Date().toISOString(),
          })
          .eq('email', data.user.email ?? '')
          .eq('status', 'invited')
      }
      return response
    }
  }

  return NextResponse.redirect(
    `${url.origin}${buildLoginErrorRedirect('otp_verify', 'Magic link expired or invalid')}`,
  )
}
