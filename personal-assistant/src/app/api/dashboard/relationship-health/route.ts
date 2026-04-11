import { NextResponse } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  let supabase, orgId: string
  if (isDevBypass()) {
    supabase = getServiceClient()
    orgId = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
  } else {
    const client = await createClient()
    if (!client) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await client.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 })
    supabase = client
    orgId = profile.org_id
  }

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, type, last_interaction_at, tags')
    .eq('org_id', orgId)
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(10)

  const now = Date.now()
  const result = (contacts ?? []).map(c => {
    const lastAt = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : 0
    const daysSince = lastAt ? Math.floor((now - lastAt) / 86400000) : 999
    let trend: 'active' | 'stable' | 'cooling' | 'cold' = 'cold'
    if (daysSince <= 3) trend = 'active'
    else if (daysSince <= 14) trend = 'stable'
    else if (daysSince <= 30) trend = 'cooling'

    return {
      name: c.name,
      type: c.type,
      daysSince,
      trend,
      tags: c.tags || [],
    }
  })

  return NextResponse.json({ contacts: result })
}
