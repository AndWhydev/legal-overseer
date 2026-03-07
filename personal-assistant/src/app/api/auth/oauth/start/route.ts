import { NextResponse } from 'next/server'
import { logger } from '@/lib/core/logger';
import {
  getOAuthRedirectUrl,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from '@/lib/integrations/oauth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')

  if (!provider) {
    return NextResponse.json({ error: 'Missing provider parameter' }, { status: 400 })
  }

  try {
    const { url, state, codeVerifier } = getOAuthRedirectUrl(provider)

    const response = NextResponse.redirect(url)

    // Persist state in httpOnly cookie for CSRF validation on callback
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    // Persist PKCE code_verifier if present
    if (codeVerifier) {
      response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      })
    }

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth setup failed'
    logger.error('OAuth start error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
