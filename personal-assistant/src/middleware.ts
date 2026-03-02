import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { checkApiRateLimit, getTierForPath } from '@/lib/api-rate-limiter'
import { validateCsrf } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── API rate limiting ─────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    const tier = getTierForPath(pathname)
    const category = pathname.startsWith('/api/auth/') ? 'auth'
      : pathname.startsWith('/api/cron/') ? 'cron'
      : pathname.startsWith('/api/channels/') ? 'webhook'
      : 'api'
    const key = `${ip}:${category}`
    const result = checkApiRateLimit(key, tier)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(result.resetMs / 1000)),
            'X-RateLimit-Limit': String(tier.maxRequests),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  // ── CSRF protection ──────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const csrfResponse = validateCsrf(request)
    if (csrfResponse) return csrfResponse
  }

  // ── Auth checks ───────────────────────────────────────────────────────────

  // Skip auth when Supabase isn't configured (local dev preview)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  // Skip auth redirect but keep Supabase wired (local dev with data)
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: DEV_BYPASS_AUTH is enabled in production! Auth bypass disabled.')
    } else {
      return NextResponse.next()
    }
  }

  // Routes that handle their own auth (Bearer tokens, cron secrets, OAuth flows)
  if (
    pathname.startsWith('/api/channels/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/monitoring/')
  ) {
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
