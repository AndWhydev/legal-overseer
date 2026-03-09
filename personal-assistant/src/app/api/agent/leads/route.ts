import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_STATUSES = new Set(['new', 'qualified', 'booked', 'converted', 'lost'])

const ALL_COLUMNS = [
  'id', 'status', 'score', 'notes', 'estimated_value', 'timeline_days',
  'service_interest', 'source_channel', 'source_detail', 'metadata',
  'created_at', 'updated_at',
  // Discovery & PCC fields
  'discovery_source', 'prospect_name', 'prospect_website', 'prospect_domain',
  'prospect_phone', 'prospect_address', 'prospect_emails', 'prospect_rating',
  'prospect_review_count',
  'fit_score', 'opportunity_score', 'priority_score', 'fit_breakdown', 'opportunity_breakdown',
  'opportunity_notes', 'outreach_angle', 'priority_services',
  'website_signals', 'serp_presence',
  'last_activity_at', 'first_ack_at', 'next_action', 'next_action_at',
].join(', ')

async function getAuthContext() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Not configured' }, { status: 503 }) as Response }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 400 }) as Response }
  }

  return { supabase, orgId: profile.org_id }
}

function parseStatuses(rawValue: string | null): string[] | null {
  if (!rawValue) return null

  const parsed = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (parsed.length === 0) return null
  if (parsed.some((status) => !ALLOWED_STATUSES.has(status))) {
    return []
  }

  return Array.from(new Set(parsed))
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const params = request.nextUrl.searchParams
  const statuses = parseStatuses(params.get('status'))
  if (statuses && statuses.length === 0) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  // New filter params
  const scoreFilter = params.get('score')
  const sourceFilter = params.get('source')
  const minValue = params.get('min_value')
  const maxValue = params.get('max_value')
  const smartView = params.get('smart_view')
  const searchQuery = params.get('q')
  const sortBy = params.get('sort_by') ?? 'updated_at'

  let query = auth.supabase
    .from('leads')
    .select(ALL_COLUMNS)
    .eq('org_id', auth.orgId)

  if (searchQuery && searchQuery.trim()) {
    const q = `%${searchQuery.trim()}%`
    query = query.or(`prospect_name.ilike.${q},source_detail.ilike.${q},notes.ilike.${q}`)
  }

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses)
  }

  if (scoreFilter && scoreFilter !== 'all') {
    query = query.eq('score', scoreFilter)
  }
  if (sourceFilter && sourceFilter !== 'all') {
    query = query.eq('source_channel', sourceFilter)
  }
  if (minValue) {
    query = query.gte('estimated_value', Number(minValue))
  }
  if (maxValue) {
    query = query.lte('estimated_value', Number(maxValue))
  }

  // Smart views
  if (smartView === 'hot_followup') {
    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
    query = query.eq('score', 'hot').lt('last_activity_at', oneDayAgo).not('status', 'in', '("converted","lost")')
  } else if (smartView === 'stale') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    query = query.lt('last_activity_at', sevenDaysAgo).not('status', 'in', '("converted","lost")')
  } else if (smartView === 'high_value') {
    query = query.gte('estimated_value', 10_000)
  } else if (smartView === 'pcc_discoveries') {
    query = query.eq('discovery_source', 'pcc_discovery')
  }

  // Sorting
  if (sortBy === 'priority_score') {
    query = query.order('priority_score', { ascending: false, nullsFirst: false })
  } else if (sortBy === 'estimated_value') {
    query = query.order('estimated_value', { ascending: false, nullsFirst: false })
  } else if (sortBy === 'last_activity_at') {
    query = query.order('last_activity_at', { ascending: true, nullsFirst: false })
  } else {
    query = query.order('updated_at', { ascending: false })
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [] })
}
