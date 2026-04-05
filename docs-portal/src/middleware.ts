import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_EMAILS = [
  "hi@torkay.com",
  "andy@allwebbedup.com.au",
]

const ALLOWED_DOMAINS = [
  "torkay.com",
]

function isEmailAllowed(email: string): boolean {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true
  const domain = email.toLowerCase().split("@")[1]
  if (domain && ALLOWED_DOMAINS.includes(domain)) return true
  return false
}

function isAdmin(email: string): boolean {
  return email.toLowerCase() === "hi@torkay.com"
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow auth callback, login page, and static assets
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg")
  ) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Create Supabase client with cookie handling
  let supabaseResponse = NextResponse.next({ request })

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

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()

  // Not authenticated -> redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  // Authenticated but not in allowlist -> forbidden
  if (!user.email || !isEmailAllowed(user.email)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("error", "unauthorized")
    // Sign them out since they are not allowed
    await supabase.auth.signOut()
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  return addSecurityHeaders(supabaseResponse)
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "no-referrer")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
