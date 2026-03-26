import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDiscovery } from '@/lib/leads/discovery'
import { getOrgPlan } from '@/lib/billing/plan-gates'
import { canDiscover, getRemainingProspects, type PlanTier } from '@/lib/leads/plan-limits'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No profile found' }, { status: 400 })
  }

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SERPAPI_KEY not configured' }, { status: 503 })
  }

  let body: { businessType?: string; location?: string; limit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { businessType, location, limit = 20 } = body
  if (!businessType || !location) {
    return NextResponse.json({ error: 'businessType and location are required' }, { status: 400 })
  }

  // Plan limit check: count discoveries this month
  const orgPlan = await getOrgPlan(supabase, profile.org_id) as PlanTier
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: discoveredThisMonth } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)
    .eq('discovery_source', 'lead_swarm')
    .gte('created_at', startOfMonth.toISOString())

  const usedThisMonth = discoveredThisMonth ?? 0
  if (!canDiscover(orgPlan, usedThisMonth)) {
    const remaining = getRemainingProspects(orgPlan, usedThisMonth)
    return NextResponse.json(
      { error: `Discovery limit reached for ${orgPlan} plan (${remaining} remaining this month). Upgrade to discover more.` },
      { status: 403 },
    )
  }

  try {
    const results = await runDiscovery({
      businessType,
      location,
      limit: Math.min(limit, 50),
      apiKey,
      enrichWebsites: true,
    })

    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
