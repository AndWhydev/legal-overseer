import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_STATUSES = new Set(['new', 'qualified', 'booked', 'converted', 'lost'])

interface PatchBody {
  status?: string
  notes?: string
  next_action?: string
  next_action_at?: string
  estimated_value?: number
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

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_activity_at: now }

  // Status change
  if (body.status != null) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'converted') {
      patch.converted_at = now
    }
  }

  // Optional fields
  if (body.notes != null) patch.notes = body.notes
  if (body.next_action != null) patch.next_action = body.next_action
  if (body.next_action_at != null) patch.next_action_at = body.next_action_at
  if (body.estimated_value != null) patch.estimated_value = body.estimated_value

  // First ack detection: if changing from 'new' to anything else, set first_ack_at
  if (body.status && body.status !== 'new') {
    const { data: current } = await auth.supabase
      .from('leads')
      .select('status, first_ack_at')
      .eq('id', leadId)
      .eq('org_id', auth.orgId)
      .maybeSingle()

    if (current?.status === 'new' && !current.first_ack_at) {
      patch.first_ack_at = now
    }
  }

  const { data, error } = await auth.supabase
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .eq('org_id', auth.orgId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  return NextResponse.json({ lead: data })
}
