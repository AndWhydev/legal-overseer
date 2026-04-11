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

// GET /api/agent/tenders/responses — fetch all tender_responses for the org's tenders
export async function GET(_request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all tender IDs belonging to this org
  const { data: tenders, error: tendersError } = await ctx.supabase
    .from('tenders')
    .select('id')
    .eq('org_id', ctx.orgId)

  if (tendersError) return NextResponse.json({ error: tendersError.message }, { status: 500 })
  if (!tenders || tenders.length === 0) return NextResponse.json([])

  const tenderIds = tenders.map((t) => t.id)

  const { data, error } = await ctx.supabase
    .from('tender_responses')
    .select('id, tender_id, status, compliance_score, fit_score, estimated_effort_hours, content')
    .in('tender_id', tenderIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
