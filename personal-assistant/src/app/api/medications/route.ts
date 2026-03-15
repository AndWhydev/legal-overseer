import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_INSERT_FIELDS = [
  'name', 'generic_name', 'dosage', 'dose_mg', 'frequency', 'category',
  'instructions', 'refill_date', 'prescriber', 'pharmacy', 'notes',
  'pill_style', 'half_life_hours', 'peak_hours', 'is_active',
] as const

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const activeOnly = params.get('active') !== 'false'

  let query = supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ medications: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No profile found' }, { status: 400 })
  }

  // Filter to allowed fields only
  const filteredBody = Object.fromEntries(
    Object.entries(body).filter(([key]) =>
      ALLOWED_INSERT_FIELDS.includes(key as (typeof ALLOWED_INSERT_FIELDS)[number])
    )
  )

  const { data, error } = await supabase
    .from('medications')
    .insert({
      ...filteredBody,
      user_id: user.id,
      org_id: profile.org_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ medication: data }, { status: 201 })
}
