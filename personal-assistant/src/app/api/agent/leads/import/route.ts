import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pccScoreToLeadScore } from '@/lib/leads/utils'
import type { ProspectResult } from '@/lib/leads/types'

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

  let body: { prospect?: ProspectResult }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { prospect } = body
  if (!prospect) {
    return NextResponse.json({ error: 'prospect is required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const score = pccScoreToLeadScore(prospect.priority_score)

  const { data, error } = await supabase
    .from('leads')
    .insert({
      org_id: profile.org_id,
      status: 'new',
      score,
      source_channel: 'pcc_discovery',
      source_detail: prospect.name,
      estimated_value: null,
      discovery_source: 'pcc_discovery',
      prospect_name: prospect.name,
      prospect_website: prospect.website,
      prospect_domain: prospect.domain,
      prospect_phone: prospect.phone,
      prospect_address: prospect.address,
      prospect_emails: prospect.emails,
      prospect_rating: prospect.rating,
      prospect_review_count: prospect.review_count,
      fit_score: prospect.fit_score,
      opportunity_score: prospect.opportunity_score,
      priority_score: prospect.priority_score,
      fit_breakdown: prospect.fit_breakdown,
      opportunity_breakdown: prospect.opportunity_breakdown,
      opportunity_notes: prospect.opportunity_notes,
      outreach_angle: prospect.outreach_angle,
      priority_services: prospect.priority_services,
      website_signals: prospect.website_signals,
      serp_presence: prospect.serp_presence,
      last_activity_at: now,
      metadata: { imported_at: now },
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead: data })
}
