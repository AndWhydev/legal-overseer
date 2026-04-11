import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

const VALID_ENTITY_TYPES = new Set([
  'invoice', 'lead', 'approval', 'contact', 'task', 'message', 'proposal', 'tender', 'watch',
])

const VALID_ACTOR_TYPES = new Set(['user', 'agent', 'system', 'cron'])

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const params = request.nextUrl.searchParams
  const entityType = params.get('entity_type')
  const entityId = params.get('entity_id')
  const actorType = params.get('actor_type')
  const dateFrom = params.get('date_from')
  const dateTo = params.get('date_to')
  const limitParam = Number(params.get('limit') ?? '50')
  const offsetParam = Number(params.get('offset') ?? '0')

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

  if (entityType && !VALID_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 })
  }
  if (actorType && !VALID_ACTOR_TYPES.has(actorType)) {
    return NextResponse.json({ error: 'Invalid actor_type' }, { status: 400 })
  }

  let query = auth.supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (actorType) query = query.eq('actor_type', actorType)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
