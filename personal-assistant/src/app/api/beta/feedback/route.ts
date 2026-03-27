import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const VALID_CATEGORIES = ['bug', 'feature', 'ux', 'performance', 'other'] as const

/**
 * POST /api/beta/feedback
 * Submit feedback from the in-app widget.
 *
 * Body: { category, message, screenshot_url?, page_url? }
 * Auth: Bearer token required (authenticated user)
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

  // Verify user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  let body: {
    category?: string
    message?: string
    screenshot_url?: string
    page_url?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const category = body.category?.trim()
  const message = body.message?.trim()

  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
  }

  if (!message || message.length < 5) {
    return NextResponse.json({ error: 'message must be at least 5 characters' }, { status: 400 })
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: 'message must be under 5000 characters' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent') ?? undefined

  const { data, error } = await supabase
    .from('beta_feedback')
    .insert({
      org_id: membership.org_id,
      user_id: user.id,
      category,
      message,
      screenshot_url: body.screenshot_url || null,
      page_url: body.page_url || null,
      user_agent: userAgent,
    })
    .select('id, created_at')
    .single()

  if (error) {
    logger.error('[beta-feedback] Insert failed', { error: error.message })
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }

  logger.info('[beta-feedback] New feedback', {
    id: data.id,
    category,
    org_id: membership.org_id,
  })

  return NextResponse.json({ id: data.id, created_at: data.created_at }, { status: 201 })
}

/**
 * GET /api/beta/feedback
 * List feedback for admin review.
 * Auth: Bearer token required (admin only)
 */
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabase
    .from('beta_feedback')
    .select('id, org_id, user_id, category, message, screenshot_url, page_url, status, admin_notes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)

  const { data, error, count } = await query

  if (error) {
    logger.error('[beta-feedback] List failed', { error: error.message })
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
  }

  return NextResponse.json({ feedback: data, total: count })
}
