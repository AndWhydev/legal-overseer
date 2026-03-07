import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { normalizeMagicLinkError } from '@/lib/auth/magic-link-error'
import { buildMagicLinkOtpRequest } from '@/lib/auth/magic-link'

export async function POST(request: Request) {
  const { email, redirectTo } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const normalizedEmail = email.trim().toLowerCase()

  // Check if user exists — only send magic links to registered users
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers()
  if (userError) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const existingUser = userData.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  )

  if (!existingUser) {
    return NextResponse.json(
      { error: 'not_registered' },
      { status: 404 },
    )
  }

  const otpRequest = buildMagicLinkOtpRequest(
    supabaseUrl,
    normalizedEmail,
    typeof redirectTo === 'string' ? redirectTo : undefined,
  )

  const res = await fetch(otpRequest.url, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(otpRequest.body),
  })

  if (!res.ok) {
    const body = await res.text()
    logger.error('[magic-link] OTP send failed:', body)
    const errorResponse = normalizeMagicLinkError(
      res.status,
      body,
      res.headers.get('retry-after'),
    )

    return NextResponse.json(
      {
        error: errorResponse.error,
        ...(errorResponse.retryAfterSeconds
          ? { retryAfterSeconds: errorResponse.retryAfterSeconds }
          : {}),
      },
      { status: errorResponse.status },
    )
  }

  return NextResponse.json({ sent: true })
}
