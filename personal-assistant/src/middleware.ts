import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Skip auth when Supabase isn't configured (local dev preview)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  // Channel sync routes are server-side operations that don't need user auth
  if (request.nextUrl.pathname.startsWith('/api/channels/')) {
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
