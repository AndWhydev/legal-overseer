import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { checkApiRateLimit, getTierForPath } from '@/lib/api-rate-limiter'
import { validateCsrf } from '@/lib/security/csrf'
import { logger } from '@/lib/core/logger'

type InMemoryRateLimitState = {
  count: number
  resetTime: number
}

const ONE_MINUTE_MS = 60_000
const authRouteRateLimits = new Map<string, InMemoryRateLimitState>()
const webhookRouteRateLimits = new Map<string, InMemoryRateLimitState>()

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com wss://*.supabase.co https://*.ingest.us.sentry.io https://secure.gravatar.com https://logo.clearbit.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  // Strip provider-identifying headers, set our own
  response.headers.delete('x-powered-by')
  response.headers.delete('server')
  response.headers.set('x-powered-by', 'BitBit')

  // Content Security Policy — prevents inline script injection
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)

  // Prevent MIME type sniffing attacks (forces browser to respect Content-Type header)
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Control referrer information sent with requests (privacy + security)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Prevent clickjacking by denying framing in iframes
  response.headers.set('X-Frame-Options', 'DENY')

  // Restrict access to browser features (camera, microphone, geolocation)
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')

  // Enable HTTP Strict Transport Security (HSTS) in production
  // Forces HTTPS for 1 year, including subdomains
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  return response
}

function checkInMemoryRateLimit(
  store: Map<string, InMemoryRateLimitState>,
  ip: string,
  limit: number
) {
  const now = Date.now()
  const existing = store.get(ip)

  if (!existing || now > existing.resetTime) {
    const nextState = {
      count: 1,
      resetTime: now + ONE_MINUTE_MS,
    }
    store.set(ip, nextState)
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil((nextState.resetTime - now) / 1000),
    }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetTime - now) / 1000),
    }
  }

  existing.count += 1
  store.set(ip, existing)

  return {
    allowed: true,
    limit,
    remaining: limit - existing.count,
    retryAfterSeconds: Math.ceil((existing.resetTime - now) / 1000),
  }
}

function createRateLimitResponse(
  message: string,
  limitResult: {
    limit: number
    remaining: number
    retryAfterSeconds: number
  }
) {
  return applySecurityHeaders(
    NextResponse.json(
      { error: message },
      {
        status: 429,
        headers: {
          'Retry-After': String(limitResult.retryAfterSeconds),
          'X-RateLimit-Limit': String(limitResult.limit),
          'X-RateLimit-Remaining': String(limitResult.remaining),
        },
      }
    )
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isPortalRoute = pathname.startsWith('/portal')
  const isPortalApiRoute = pathname.startsWith('/api/portal/')
  const ip = getClientIp(request)

  // Ensure CSP is present across all matched responses.
  if (!isApiRoute && !isDashboardRoute && !isPortalRoute) {
    return applySecurityHeaders(NextResponse.next())
  }

  // ── Cron route protection ────────────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      )
    }
  }

  // ── In-memory route rate limiting ────────────────────────────────────────
  if (pathname.startsWith('/api/auth/')) {
    const result = checkInMemoryRateLimit(authRouteRateLimits, ip, 20)
    if (!result.allowed) {
      return createRateLimitResponse('Too many auth requests', result)
    }
  }

  if (pathname.startsWith('/api/webhooks/')) {
    const result = checkInMemoryRateLimit(webhookRouteRateLimits, ip, 100)
    if (!result.allowed) {
      return createRateLimitResponse('Too many webhook requests', result)
    }
  }

  // ── API rate limiting ─────────────────────────────────────────────────────
  // Skip rate limiting for authenticated dashboard GET reads — users querying
  // their own data should never be throttled. Rate limiting still applies to
  // mutations (POST/PATCH/DELETE) and non-agent API routes.
  const isDashboardRead = request.method === 'GET' && pathname.startsWith('/api/agent/')
  if (isApiRoute && !isDashboardRead) {
    const tier = getTierForPath(pathname)
    const category = pathname.startsWith('/api/auth/') ? 'auth'
      : pathname.startsWith('/api/cron/') ? 'cron'
      : (pathname.startsWith(/api/channels/) || pathname.startsWith(/api/connections/) || pathname.startsWith(/api/webhooks/)) ? webhook
      : pathname.startsWith('/api/agent/chat') ? 'chat'
      : 'api'
    const key = `${ip}:${category}`
    const result = checkApiRateLimit(key, tier)

    if (!result.allowed) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil(result.resetMs / 1000)),
              'X-RateLimit-Limit': String(tier.maxRequests),
              'X-RateLimit-Remaining': '0',
            },
          },
        )
      )
    }
  }

  // ── CSRF protection (production only — dev uses Origin allowlist anyway) ──
  // Bridge endpoints use bearer token auth, not cookies — exempt from CSRF
  const csrfExempt = pathname.startsWith('/api/connections/') || pathname.startsWith('/api/channels/') || pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/cron/')
  if (isApiRoute && process.env.NODE_ENV === 'production' && !csrfExempt) {
    const csrfResponse = validateCsrf(request)
    if (csrfResponse) return applySecurityHeaders(csrfResponse)
  }

  // ── Auth checks ───────────────────────────────────────────────────────────

  // Skip auth when Supabase isn't configured (local dev preview)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return applySecurityHeaders(NextResponse.next())
  }

  // Skip auth redirect but keep Supabase wired (local dev with data)
  // Check both prefixed and unprefixed variants (edge runtime only sees NEXT_PUBLIC_*)
  const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH ?? process.env.DEV_BYPASS_AUTH
  if (bypassAuth === 'true') {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: DEV_BYPASS_AUTH is enabled in production! Auth bypass disabled.')
    } else {
      return applySecurityHeaders(NextResponse.next())
    }
  }

  // Routes that handle their own auth (Bearer tokens, cron secrets, OAuth flows, webhooks, portal)
  if (
    pathname.startsWith('/api/channels/') ||
    pathname.startsWith("/api/connections/") ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/monitoring/') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/portal/') ||
    pathname.startsWith('/portal/') ||
    pathname === '/api/agent/invoices/dispatch' // Fly.io worker callback (WORKER_AUTH_TOKEN)
  ) {
    return applySecurityHeaders(NextResponse.next())
  }

  return applySecurityHeaders(await updateSession(request))
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/portal/:path*', '/login', '/onboard'],
}