import { NextResponse } from 'next/server'

import { isSupportedEmailOtpType, resolveSafeAuthRedirect } from '@/lib/auth/callback'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = resolveSafeAuthRedirect(url.searchParams.get('next'), url.origin)

  if (tokenHash && isSupportedEmailOtpType(type)) {
    const supabase = await createClient()

    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      })

      if (!error) {
        return NextResponse.redirect(`${url.origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${url.origin}/login?error=auth`)
}
