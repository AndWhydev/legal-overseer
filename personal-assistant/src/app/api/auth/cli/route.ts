import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/auth/cli?port=<port>
 *
 * CLI OAuth flow entry point. If the user is already authenticated
 * (has a valid session cookie from being logged in), redirects to
 * the CLI's local callback with the session token.
 *
 * If not authenticated, redirects to the login page with a return URL
 * back to this endpoint.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const port = url.searchParams.get('port')

  if (!port) {
    return NextResponse.json({ error: 'Missing port parameter' }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { session } } = await supabase.auth.getSession()

  if (session?.access_token) {
    // User is already logged in — redirect to CLI callback with token
    const callbackUrl = `http://localhost:${port}/callback?token=${encodeURIComponent(session.access_token)}`
    return NextResponse.redirect(callbackUrl)
  }

  // Not logged in — redirect to login page with return URL back here
  const returnUrl = `${url.origin}/api/auth/cli?port=${port}`
  const loginUrl = `${url.origin}/login?redirect=${encodeURIComponent(returnUrl)}`
  return NextResponse.redirect(loginUrl)
}
