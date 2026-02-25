import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { channelTriage } from '@/lib/agent/channel-triage'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await channelTriage.run(ctx.supabase, ctx.orgId)
  return NextResponse.json(result)
}

export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const digest = await channelTriage.generateDigest(ctx.supabase, ctx.orgId)
  return NextResponse.json(digest)
}
