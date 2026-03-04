import { NextRequest, NextResponse } from 'next/server'

/**
 * CSRF protection via Origin header validation.
 *
 * Browsers always send an Origin header on cross-origin requests and on
 * same-origin POST/PUT/PATCH/DELETE. Validating that the Origin matches our
 * app's domain blocks cross-site request forgery attacks.
 *
 * This complements Supabase auth tokens (which provide implicit CSRF
 * protection for authenticated routes) with an additional defense-in-depth
 * layer that also protects unauthenticated state-changing endpoints.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Paths exempt from CSRF checks (they use their own auth: HMAC signatures, cron secrets, etc.) */
const EXEMPT_PREFIXES = [
  '/api/webhooks/',   // Stripe, Asana, Calendly — use webhook signature verification
  '/api/cron/',       // Server-side crons — use CRON_SECRET header
  '/api/channels/',   // Incoming webhooks (WhatsApp, etc.) — use platform verification
  '/api/auth/',       // Auth endpoints — same-origin login forms + OAuth callbacks
]

/**
 * Get allowed origins from environment.
 * Includes NEXT_PUBLIC_APP_URL and VERCEL_URL for preview deployments.
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    origins.add(new URL(appUrl).origin)
  }

  // Vercel preview deployments
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    origins.add(`https://${vercelUrl}`)
  }

  // Always allow localhost in development (common dev ports)
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000')
    origins.add('http://localhost:3001')
    origins.add('http://localhost:3002')
    origins.add('http://127.0.0.1:3000')
    origins.add('http://127.0.0.1:3001')
    origins.add('http://127.0.0.1:3002')
  }

  return origins
}

/**
 * Validate the Origin header of a request against allowed origins.
 * Returns null if valid, or a NextResponse with 403 if invalid.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  // Only check state-changing methods
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return null
  }

  const { pathname } = request.nextUrl

  // Skip exempt paths (webhooks, crons, channels — they have their own auth)
  if (EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return null
  }

  const origin = request.headers.get('origin')

  // No Origin header: could be a same-origin request from older browsers,
  // server-to-server call, or non-browser client. Allow if Referer matches,
  // otherwise block in production.
  if (!origin) {
    const referer = request.headers.get('referer')
    if (referer) {
      const refererOrigin = new URL(referer).origin
      const allowed = getAllowedOrigins()
      if (allowed.has(refererOrigin)) {
        return null
      }
    }

    // In development, allow requests without Origin (curl, Postman, etc.)
    if (process.env.NODE_ENV !== 'production') {
      return null
    }

    return NextResponse.json(
      { error: 'Forbidden: missing Origin header' },
      { status: 403 }
    )
  }

  const allowed = getAllowedOrigins()
  if (allowed.has(origin)) {
    return null
  }

  return NextResponse.json(
    { error: 'Forbidden: origin not allowed' },
    { status: 403 }
  )
}
