import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner } from '@/lib/bridges'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config, status')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  if (conn.status !== 'suspended') {
    return NextResponse.json({ error: `Connection is ${conn.status}, not suspended` }, { status: 400 })
  }

  const config = conn.config as Record<string, string>
  if (!config.fly_machine_id) {
    return NextResponse.json({ error: 'No Fly machine associated' }, { status: 400 })
  }

  const provisioner = createProvisioner(supabase)

  try {
    await provisioner.wake(conn.id, config.fly_machine_id)
    return NextResponse.json({ ok: true, status: 'connected' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
