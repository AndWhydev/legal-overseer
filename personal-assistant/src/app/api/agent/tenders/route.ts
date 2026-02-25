import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { searchTenders } = await import('@/lib/agent/tender-hunter')
  const results = await searchTenders(ctx.supabase, ctx.orgId, body)
  return NextResponse.json(results)
}

export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await ctx.supabase
    .from('tenders')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(20)
  return NextResponse.json(data || [])
}
