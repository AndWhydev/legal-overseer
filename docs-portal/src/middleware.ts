import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_EMAILS = [
  "hi@torkay.com",
  "andy@allwebbedup.com.au",
]

const ALLOWED_DOMAINS = [
  "torkay.com",
]

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  "/",
  "/docs/connections",
  "/docs/overview",
  "/docs/getting-started/quick-start",
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"))
}

function isEmailAllowed(email: string): boolean {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true
  const domain = email.toLowerCase().split("@")[1]
  if (domain && ALLOWED_DOMAINS.includes(domain)) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: login, auth, static assets
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg")
  ) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Public docs pages: allow without auth, but still set up Supabase session
  // so the sidebar can detect auth state
  if (isPublicPath(pathname)) {
    let supabaseResponse = NextResponse.next({ request })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
          },
        },
      }
    )
    // Refresh session if exists (but don't require it)
    await supabase.auth.getUser()
    return addSecurityHeaders(supabaseResponse, true)
  }

  // Internal docs pages: require authentication
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  if (!user.email || !isEmailAllowed(user.email)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("error", "unauthorized")
    await supabase.auth.signOut()
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  return addSecurityHeaders(supabaseResponse, false)
}

function addSecurityHeaders(response: NextResponse, isPublic = false): NextResponse {
  if (!isPublic) {
    // Internal pages: block indexing entirely
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
    response.headers.set("Cache-Control", "private, no-store")
  }
  // All pages get security headers
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "no-referrer")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
