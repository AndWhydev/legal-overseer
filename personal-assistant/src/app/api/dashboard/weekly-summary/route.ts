import { NextResponse } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { generateWeeklyOperationsSummary } from '@/lib/intelligence/weekly-operations-summary'

export const dynamic = 'force-dynamic'

export async function GET() {
  let supabase
  let orgId: string

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

  const summary = await generateWeeklyOperationsSummary(supabase, orgId)
  return NextResponse.json(summary)
}
