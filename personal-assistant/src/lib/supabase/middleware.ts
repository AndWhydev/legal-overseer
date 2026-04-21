import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Cheap pre-check: does the request have any Supabase auth cookie at all?
 * Supabase SSR writes cookies named `sb-<project-ref>-auth-token(.N)?`.
 * If none exist we can short-circuit without an `auth.getUser()` round-trip —
 * important on the app host's `/` where most first-time traffic is signed out.
 */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
}

/** Paths on the app host where a signed-in user should be bounced into /dashboard. */
const AUTH_ENTRY_PATHS: ReadonlySet<string> = new Set(['/', '/login', '/signup'])

/** Paths that don't require auth (logged-out users may hit them without a /login redirect). */
function isPublicAppPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/callback') ||
    pathname.startsWith('/portal/login') ||
    pathname === '/oauth-done' ||
    pathname === '/privacy' ||
    pathname === '/terms'
  )
}

/**
 * App-host auth gate. Handles both directions:
 *   - signed-in user hitting /, /login, /signup  → /dashboard
 *   - signed-out user hitting a protected route  → /login?next=<path>
 *
 * Callers should only invoke this on requests that have already been confirmed
 * to be served by the app host (see proxy.ts).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  // Fast path: no auth cookie + public path → skip the Supabase round-trip entirely.
  // Most marketing-CTA click-throughs to /login hit this branch.
  if (!hasSupabaseAuthCookie(request) && isPublicAppPath(pathname)) {
    if (pathname === '/') {
      // Unauthenticated root on the app host → send to /login.
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed-in user on /, /login, /signup → bounce into the app.
  if (user && AUTH_ENTRY_PATHS.has(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Signed-out user on a protected route → /login with next=<path>.
  if (!user && !isPublicAppPath(pathname)) {
    const url = request.nextUrl.clone()
    if (pathname.startsWith('/portal')) {
      url.pathname = '/portal/login'
      url.searchParams.set('next', pathname)
    } else {
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
