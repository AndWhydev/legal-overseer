import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { sendBetaInviteEmail } from '@/lib/beta/invite-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function verifyAdmin(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') return null
  return user
}

/**
 * POST /api/admin/beta-invite
 *
 * Body: { waitlist_ids: string[] }
 * - Generates unique invite codes for each waitlist entry
 * - Sends invite emails via Resend
 * - Updates waitlist status to 'invited'
 *
 * GET /api/admin/beta-invite
 * - Returns waitlist entries with their status
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const admin = await verifyAdmin(supabase as any, token)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: { waitlist_ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = body.waitlist_ids
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'waitlist_ids array required' }, { status: 400 })
  }

  if (ids.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 invites per batch' }, { status: 400 })
  }

  // Fetch waitlist entries
  const { data: entries, error: fetchErr } = await supabase
    .from('waitlist')
    .select('id, email, status')
    .in('id', ids)

  if (fetchErr || !entries) {
    logger.error('[beta-invite] Failed to fetch waitlist entries', { error: fetchErr?.message })
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }

  const results: { email: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  for (const entry of entries) {
    // Skip already-invited entries
    if (entry.status === 'invited' || entry.status === 'accepted') {
      results.push({ email: entry.email, status: 'skipped', reason: `Already ${entry.status}` })
      continue
    }

    // Generate a unique invite code
    const code = `BETA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    // Insert invite code
    const { error: codeErr } = await supabase
      .from('invite_codes')
      .insert({
        code,
        created_by: admin.id,
        max_uses: 1,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })

    if (codeErr) {
      logger.error('[beta-invite] Failed to create invite code', { email: entry.email, error: codeErr.message })
      results.push({ email: entry.email, status: 'error', reason: 'Code creation failed' })
      continue
    }

    // Send invite email
    const sent = await sendBetaInviteEmail(entry.email, code)
    if (!sent) {
      results.push({ email: entry.email, status: 'error', reason: 'Email send failed' })
      continue
    }

    // Update waitlist entry
    const { error: updateErr } = await supabase
      .from('waitlist')
      .update({
        status: 'invited',
        invited_at: new Date().toISOString(),
        invite_code: code,
      })
      .eq('id', entry.id)

    if (updateErr) {
      logger.warn('[beta-invite] Failed to update waitlist status', { email: entry.email, error: updateErr.message })
    }

    results.push({ email: entry.email, status: 'sent' })
  }

  const sent = results.filter(r => r.status === 'sent').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  logger.info('[beta-invite] Batch complete', { sent, skipped, errors })

  return NextResponse.json({ results, summary: { sent, skipped, errors } })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const admin = await verifyAdmin(supabase as any, token)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') // optional filter
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabase
    .from('waitlist')
    .select('id, email, referral_source, status, created_at, invited_at, invite_code', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    logger.error('[beta-invite] Failed to list waitlist', { error: error.message })
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 })
  }

  return NextResponse.json({ entries: data, total: count })
}
