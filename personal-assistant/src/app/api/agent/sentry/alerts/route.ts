import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acknowledgeSentryAlert, processSentryEscalations } from '@/lib/agent/sentry-escalation'

const DEFAULT_STATUSES = ['pending', 'escalated']
const ALLOWED_STATUSES = new Set(['pending', 'escalated', 'acknowledged', 'resolved'])

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

  return { supabase, orgId: profile.org_id, userId: user.id }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50

  const statusesParam = request.nextUrl.searchParams.get('statuses')
  const statuses = statusesParam
    ? statusesParam
        .split(',')
        .map((status) => status.trim())
        .filter((status) => status.length > 0)
    : DEFAULT_STATUSES

  if (statuses.some((status) => !ALLOWED_STATUSES.has(status))) {
    return NextResponse.json({ error: 'Invalid statuses filter' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('sentry_alerts')
    .select('*')
    .eq('org_id', auth.orgId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: { action?: string; alertId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'acknowledge' || typeof body.alertId !== 'string') {
    return NextResponse.json(
      { error: "action='acknowledge' and alertId are required" },
      { status: 400 },
    )
  }

  const ackResult = await acknowledgeSentryAlert(auth.supabase, body.alertId, auth.userId)

  if (!ackResult.ok) {
    if (ackResult.error === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Alert already acknowledged' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, alertId: ackResult.alertId })
}

export async function POST() {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const result = await processSentryEscalations(auth.supabase, auth.orgId)
  return NextResponse.json({ result })
}
