import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner, createImessageProvisioner } from '@/lib/bridges'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { connection_id } = await request.json() as { connection_id: string }

  const { data: conn } = await supabase
    .from('org_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('org_id', orgId)
    .single()

  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  const config = conn.config as Record<string, unknown>
  const machineId = config.fly_machine_id as string | undefined

  if (!machineId && conn.provider !== 'imessage') {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider })
  }

  if (conn.status === 'connected' && config.linked_at) {
    return NextResponse.json({
      status: 'linked',
      protocol: conn.provider,
      linked_at: config.linked_at,
    })
  }

  if (conn.status === 'error') {
    return NextResponse.json({
      status: 'error',
      protocol: conn.provider,
      error: conn.last_error,
    })
  }

  if (conn.provider === 'imessage' && config.bb_server_url) {
    const bbUrl = config.bb_server_url as string
    const bbPass = config.bb_password as string
    const vncIp = config.vps_ip as string
    const vncPort = (config.vnc_port as number) || 5900
    const vncPassword = config.vnc_password as string

    const provisioner = createImessageProvisioner(supabase)

    const healthy = await provisioner.checkHealth(bbUrl, bbPass)
    if (!healthy) {
      return NextResponse.json({
        status: 'waiting',
        vnc: { ip: vncIp, port: vncPort, password: vncPassword },
        sign_in_state: 'waiting_for_password',
      })
    }

    const active = await provisioner.checkImessageActive(bbUrl, bbPass)
    if (active) {
      const linkedAt = new Date().toISOString()
      await supabase
        .from('org_connections')
        .update({
          status: 'connected',
          config: { ...config, linked_at: linkedAt },
          updated_at: linkedAt,
        })
        .eq('id', connection_id)
      return NextResponse.json({ status: 'linked' })
    }

    return NextResponse.json({
      status: 'waiting',
      vnc: { ip: vncIp, port: vncPort, password: vncPassword },
      sign_in_state: 'waiting_for_password',
    })
  }

  if (!machineId) {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider })
  }

  const provisioner = createProvisioner(supabase)
  try {
    const health = await provisioner.checkHealth(machineId)
    if (!health.running) {
      return NextResponse.json({
        status: 'error',
        protocol: conn.provider,
        error: `Bridge machine is ${health.state}`,
      })
    }
  } catch {
    // Machine check failed, still waiting
  }

  // Relay QR data if the bridge has posted one via /api/bridges/qr-callback
  const qrData = config.qr_data as string | undefined
  if (qrData) {
    return NextResponse.json({ status: 'waiting', protocol: conn.provider, qr: qrData })
  }

  return NextResponse.json({ status: 'waiting', protocol: conn.provider })
}
