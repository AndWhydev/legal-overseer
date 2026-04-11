import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_WATCH_TYPES = new Set(['error_keyword', 'uptime', 'negative_sentiment'])
const VALID_WATCH_STATUSES = new Set(['active', 'paused'])

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseNumber(
  value: unknown,
  bounds: { min: number; max: number },
  fieldName: string,
): { value?: number; error?: string } {
  if (value === undefined) return {}

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { error: `${fieldName} must be a number` }
  }

  const normalized = Math.floor(value)
  if (normalized < bounds.min || normalized > bounds.max) {
    return { error: `${fieldName} must be between ${bounds.min} and ${bounds.max}` }
  }

  return { value: normalized }
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

  return { supabase, orgId: profile.org_id, userId: user.id }
}

export async function GET() {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('watches')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ watches: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: Record<string, unknown>
  try {
    body = normalizeObject(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const watchType = typeof body.watch_type === 'string' ? body.watch_type : ''
  if (!VALID_WATCH_TYPES.has(watchType)) {
    return NextResponse.json({ error: 'Invalid watch_type' }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const intervalSeconds = parseNumber(body.interval_seconds, { min: 60, max: 86400 }, 'interval_seconds')
  if (intervalSeconds.error) {
    return NextResponse.json({ error: intervalSeconds.error }, { status: 400 })
  }

  const escalationMinutes = parseNumber(
    body.escalation_minutes,
    { min: 1, max: 1440 },
    'escalation_minutes',
  )
  if (escalationMinutes.error) {
    return NextResponse.json({ error: escalationMinutes.error }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('watches')
    .insert({
      org_id: auth.orgId,
      watch_type: watchType,
      description,
      conditions: normalizeObject(body.conditions),
      interval_seconds: intervalSeconds.value ?? 300,
      escalation_minutes: escalationMinutes.value ?? 15,
      status: 'active',
    })
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create watch' }, { status: 500 })
  }

  return NextResponse.json({ watch: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: Record<string, unknown>
  try {
    body = normalizeObject(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const watchId = typeof body.watchId === 'string' ? body.watchId : ''
  if (!watchId) {
    return NextResponse.json({ error: 'watchId is required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  if (body.watch_type !== undefined) {
    if (typeof body.watch_type !== 'string' || !VALID_WATCH_TYPES.has(body.watch_type)) {
      return NextResponse.json({ error: 'Invalid watch_type' }, { status: 400 })
    }
    patch.watch_type = body.watch_type
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json({ error: 'description must be a non-empty string' }, { status: 400 })
    }
    patch.description = body.description.trim()
  }

  if (body.conditions !== undefined) {
    if (!body.conditions || typeof body.conditions !== 'object' || Array.isArray(body.conditions)) {
      return NextResponse.json({ error: 'conditions must be an object' }, { status: 400 })
    }
    patch.conditions = body.conditions
  }

  const intervalSeconds = parseNumber(body.interval_seconds, { min: 60, max: 86400 }, 'interval_seconds')
  if (intervalSeconds.error) {
    return NextResponse.json({ error: intervalSeconds.error }, { status: 400 })
  }
  if (intervalSeconds.value !== undefined) {
    patch.interval_seconds = intervalSeconds.value
  }

  const escalationMinutes = parseNumber(
    body.escalation_minutes,
    { min: 1, max: 1440 },
    'escalation_minutes',
  )
  if (escalationMinutes.error) {
    return NextResponse.json({ error: escalationMinutes.error }, { status: 400 })
  }
  if (escalationMinutes.value !== undefined) {
    patch.escalation_minutes = escalationMinutes.value
  }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_WATCH_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'status must be active or paused' }, { status: 400 })
    }
    patch.status = body.status
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('watches')
    .update(patch)
    .eq('id', watchId)
    .eq('org_id', auth.orgId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Watch not found' }, { status: 404 })
  }

  return NextResponse.json({ watch: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const watchId = request.nextUrl.searchParams.get('watchId')
  if (!watchId) {
    return NextResponse.json({ error: 'watchId is required' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('watches')
    .delete()
    .eq('id', watchId)
    .eq('org_id', auth.orgId)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Watch not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
