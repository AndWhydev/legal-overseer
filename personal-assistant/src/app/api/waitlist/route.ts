import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

/**
 * Waitlist API
 *
 * POST /api/waitlist  — join the waitlist
 * GET  /api/waitlist?code=XXX — validate an invite code
 */

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'

// POST — add email to waitlist
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: string; referral_source?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }

  const supabase = getAnonClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { error } = await supabase
    .from('waitlist')
    .insert({
      email,
      referral_source: body.referral_source ?? 'direct',
    })

  if (error) {
    if (error.code === '23505') {
      // Unique violation — already on the list
      return NextResponse.json({ message: 'already_registered' }, { status: 200 })
    }
    logger.error('[waitlist] insert error', { message: error.message })
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }

  logger.info('[waitlist] new signup', { email: email.replace(/@.*/, '@…') })
  return NextResponse.json({ message: 'registered' }, { status: 201 })
}

// GET — validate an invite code
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')?.trim().toUpperCase()

  if (!code) {
    return NextResponse.json({ error: 'code parameter is required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('invite_codes')
    .select('id, code, use_count, max_uses, expires_at, used_at')
    .eq('code', code)
    .single()

  if (error || !data) {
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 200 })
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' }, { status: 200 })
  }

  // Check usage cap
  if (data.use_count >= data.max_uses) {
    return NextResponse.json({ valid: false, reason: 'exhausted' }, { status: 200 })
  }

  return NextResponse.json({ valid: true, code: data.code }, { status: 200 })
}
