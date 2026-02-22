import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_STATUSES = new Set(['new', 'qualified', 'booked', 'converted', 'lost'])

interface PatchBody {
  status?: string
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { leadId } = await context.params
  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = typeof body.status === 'string' ? body.status : ''
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { status }
  if (status === 'converted') {
    patch.converted_at = new Date().toISOString()
  }

  const { data, error } = await auth.supabase
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .eq('org_id', auth.orgId)
    .select(
      'id, status, score, notes, estimated_value, timeline_days, service_interest, source_channel, source_detail, metadata, created_at, updated_at',
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  return NextResponse.json({ lead: data })
}
