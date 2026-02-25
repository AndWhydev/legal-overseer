import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// Audit logger available for future PATCH/POST mutations:
// import { logAuditEvent } from '@/lib/audit/logger'

const ALLOWED_STATUSES = new Set(['new', 'qualified', 'booked', 'converted', 'lost'])

interface LeadRow {
  id: string
  status: 'new' | 'qualified' | 'booked' | 'converted' | 'lost'
  score: 'hot' | 'warm' | 'cold'
  notes: string | null
  estimated_value: number | null
  timeline_days: number | null
  service_interest: string[] | null
  source_channel: string
  source_detail: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

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

  const statuses = parseStatuses(request.nextUrl.searchParams.get('status'))
  if (statuses && statuses.length === 0) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  let query = auth.supabase
    .from('leads')
    .select(
      'id, status, score, notes, estimated_value, timeline_days, service_interest, source_channel, source_detail, metadata, created_at, updated_at',
    )
    .eq('org_id', auth.orgId)
    .order('updated_at', { ascending: false })

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: (data ?? []) as LeadRow[] })
}
