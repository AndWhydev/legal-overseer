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
    const templateType = url.searchParams.get('template_type')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = ctx.supabase
      .from('generated_content')
      .select('id, template_type, inputs, output, created_at', { count: 'exact' })
      .eq('org_id', ctx.orgId)

    if (templateType) {
      query = query.eq('template_type', templateType)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('[creator-studio] Failed to fetch history:', error)
      return NextResponse.json(
        { error: 'Failed to fetch history' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      limit,
      offset,
      hasMore: (offset + limit) < (count || 0),
    })
  } catch (err) {
    logger.error('[creator-studio] History fetch failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 500 }
    )
  }
}
