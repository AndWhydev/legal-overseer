import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { channelTriage } from '@/lib/agent/channel-triage'
import { runDailyDigest } from '@/lib/agent/daily-digest'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

/** POST /api/agent/triage — run triage on unprocessed messages */
export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await channelTriage.run(ctx.supabase, ctx.orgId)
  return NextResponse.json(result)
}

/** GET /api/agent/triage — get digest or threads */
export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const digest = await channelTriage.generateDigest(ctx.supabase, ctx.orgId)
  return NextResponse.json(digest)
}

/** PUT /api/agent/triage — run daily digest */
export async function PUT() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runDailyDigest(ctx.supabase, ctx.orgId, { sendWhatsApp: false })
  return NextResponse.json(result)
}
