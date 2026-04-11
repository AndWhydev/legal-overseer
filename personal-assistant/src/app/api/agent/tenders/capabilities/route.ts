import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id as string }
}

// GET /api/agent/tenders/capabilities
export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/agent/tenders/capabilities
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Record<string, unknown>

  const { data, error } = await ctx.supabase
    .from('capability_profiles')
    .upsert(
      {
        org_id: ctx.orgId,
        name: body.name as string,
        service_category: (body.service_category as string) ?? '',
        description: (body.description as string) ?? '',
        skills: (body.skills as string[]) ?? [],
        certifications: (body.certifications as string[]) ?? [],
        past_projects: (body.past_projects as Record<string, unknown>[]) ?? [],
        location_coverage: (body.location_coverage as string[]) ?? [],
        max_contract_value: (body.max_contract_value as number) ?? null,
      },
      { onConflict: 'org_id,name' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/agent/tenders/capabilities?id=xxx
export async function DELETE(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await ctx.supabase
    .from('capability_profiles')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
