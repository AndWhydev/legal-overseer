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

/**
 * GET /api/beta/daily-tip
 *
 * Returns the daily tip for the current user based on their account age (days since signup).
 * Auth: Bearer token required.
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

  // Verify user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Calculate day number since signup (1-indexed)
  const createdAt = new Date(user.created_at)
  const now = new Date()
  const daysSinceSignup = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)) + 1

  // Fetch the tip for this day number
  const { data: tip, error: tipErr } = await supabase
    .from('beta_daily_tips')
    .select('id, day_number, title, body, cta_label, cta_path')
    .eq('day_number', daysSinceSignup)
    .single()

  if (tipErr || !tip) {
    // No tip for this day -- could be past the seeded range
    // Return the latest tip as a fallback
    const { data: latest } = await supabase
      .from('beta_daily_tips')
      .select('id, day_number, title, body, cta_label, cta_path')
      .order('day_number', { ascending: false })
      .limit(1)
      .single()

    if (!latest) {
      return NextResponse.json({ tip: null, day: daysSinceSignup })
    }

    return NextResponse.json({
      tip: latest,
      day: daysSinceSignup,
      is_repeat: true,
    })
  }

  return NextResponse.json({
    tip,
    day: daysSinceSignup,
    is_repeat: false,
  })
}
