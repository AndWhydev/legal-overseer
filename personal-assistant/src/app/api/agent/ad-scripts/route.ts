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

  try {
    const body = await request.json()
    const { generateScripts } = await import('@/lib/agent/ad-script-gen')
    const scripts = await generateScripts(ctx.supabase, ctx.orgId, body)
    return NextResponse.json(scripts)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Script generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { listScriptBatches } = await import('@/lib/agent/ad-script-gen')
    const batches = await listScriptBatches(ctx.supabase, ctx.orgId)
    return NextResponse.json({ batches })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list scripts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
