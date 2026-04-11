import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineAnalytics, LeadScore } from '@/lib/leads/types'

export async function GET() {
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

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, status, score, estimated_value, source_channel, created_at, first_ack_at, last_activity_at')
    .eq('org_id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = leads ?? []
  const active = rows.filter((l) => !['converted', 'lost'].includes(l.status))
  const converted = rows.filter((l) => l.status === 'converted')
  const lost = rows.filter((l) => l.status === 'lost')

  // Pipeline value
  const totalValue = active.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)

  // Conversion rate
  const finalized = converted.length + lost.length
  const conversionRate = finalized > 0 ? Math.round((converted.length / finalized) * 100) : 0

  // Avg days in stage (simplified: avg age of active leads)
  const now = Date.now()
  const avgDaysInStage = active.length > 0
    ? Math.round(active.reduce((sum, l) => sum + (now - new Date(l.created_at).getTime()) / 86_400_000, 0) / active.length)
    : 0

  // Speed-to-lead (avg minutes from creation to first ack)
  const ackedLeads = rows.filter((l) => l.first_ack_at)
  const avgSpeedToLeadMinutes = ackedLeads.length > 0
    ? Math.round(ackedLeads.reduce((sum, l) => {
        return sum + (new Date(l.first_ack_at!).getTime() - new Date(l.created_at).getTime()) / 60_000
      }, 0) / ackedLeads.length)
    : null

  // Stale count (inactive >7 days, not finalized)
  const sevenDaysAgo = now - 7 * 86_400_000
  const staleCount = active.filter((l) => {
    const lastActivity = l.last_activity_at ? new Date(l.last_activity_at).getTime() : 0
    return lastActivity < sevenDaysAgo
  }).length

  // Source breakdown
  const leadsBySource: Record<string, number> = {}
  for (const l of rows) {
    leadsBySource[l.source_channel] = (leadsBySource[l.source_channel] ?? 0) + 1
  }

  // Score breakdown
  const leadsByScore: Record<LeadScore, number> = { hot: 0, warm: 0, cold: 0 }
  for (const l of rows) {
    if (l.score in leadsByScore) leadsByScore[l.score as LeadScore]++
  }

  const analytics: PipelineAnalytics = {
    totalValue,
    conversionRate,
    avgDaysInStage,
    avgSpeedToLeadMinutes,
    staleCount,
    leadsBySource,
    leadsByScore,
  }

  return NextResponse.json({ analytics })
}
