import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, userId: user.id, orgId: profile.org_id }
}

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const month = url.searchParams.get('month') // YYYY-MM format
    const status = url.searchParams.get('status')

    let query = ctx.supabase
      .from('generated_content')
      .select('id, template_type, inputs, output, status, scheduled_for, created_at')
      .eq('org_id', ctx.orgId)

    if (month) {
      const start = `${month}-01`
      const [year, mon] = month.split('-').map(Number)
      const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
      query = query.gte('scheduled_for', start).lt('scheduled_for', nextMonth)
    } else {
      // Default: return all scheduled/published content
      query = query.not('scheduled_for', 'is', null)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query.order('scheduled_for', { ascending: true })

    if (error) {
      logger.error('[creator-studio] Failed to fetch schedule:', error)
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
    }

    return NextResponse.json({ items: data || [] })
  } catch (err) {
    logger.error('[creator-studio] Schedule fetch failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { id, scheduled_for, status } = body

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const VALID_STATUSES = ['draft', 'scheduled', 'published'] as const
    type ValidStatus = typeof VALID_STATUSES[number]
    if (status && !VALID_STATUSES.includes(status as ValidStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (scheduled_for !== undefined) patch.scheduled_for = scheduled_for
    if (status !== undefined) patch.status = status

    const { data, error } = await ctx.supabase
      .from('generated_content')
      .update(patch)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select('id, template_type, inputs, status, scheduled_for, created_at')
      .single()

    if (error) {
      logger.error('[creator-studio] Failed to update schedule:', error)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (err) {
    logger.error('[creator-studio] Schedule patch failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
