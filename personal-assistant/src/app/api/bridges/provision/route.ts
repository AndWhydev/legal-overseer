import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { createProvisioner, createImessageProvisioner } from '@/lib/bridges'
import { generateBridgeToken } from '@/lib/connections'
import type { BridgeProtocol } from '@/lib/bridges'

const VALID_PROTOCOLS: BridgeProtocol[] = ['imessage', 'whatsapp', 'android-messages']

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)
  const { protocol, apple_id_email } = await request.json() as { protocol: BridgeProtocol; apple_id_email?: string }

  if (!VALID_PROTOCOLS.includes(protocol)) {
    return NextResponse.json({ error: `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(', ')}` }, { status: 400 })
  }

  if (protocol === 'imessage' && !apple_id_email) {
    return NextResponse.json({ error: 'apple_id_email is required for iMessage provisioning' }, { status: 400 })
  }

  // Check if connection already exists
  const { data: existing } = await supabase
    .from('org_connections')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('provider', protocol)
    .single()

  let connectionId: string

  if (existing && existing.status === 'connected') {
    return NextResponse.json({ error: `${protocol} is already connected` }, { status: 409 })
  }

  if (existing) {
    connectionId = existing.id
    await supabase
      .from('org_connections')
      .update({ status: 'provisioning', updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  } else {
    const { data: conn, error } = await supabase
      .from('org_connections')
      .insert({
        org_id: orgId,
        provider: protocol,
        display_name: protocol === 'android-messages' ? 'Android Messages' : protocol === 'imessage' ? 'iMessage' : 'WhatsApp',
        transport: 'webhook',
        capabilities: ['push', 'send', 'webhook'],
        status: 'provisioning',
        bridge_token: generateBridgeToken(),
        config: {},
      })
      .select('id')
      .single()

    if (error || !conn) {
      return NextResponse.json({ error: error?.message || 'Failed to create connection' }, { status: 500 })
    }
    connectionId = conn.id
  }

  try {
    let linkingInfo
    if (protocol === 'imessage') {
      const provisioner = createImessageProvisioner(supabase)
      linkingInfo = await provisioner.provision({
        orgId,
        userId: user.id,
        connectionId,
        appleIdEmail: apple_id_email!,
      })
    } else {
      const provisioner = createProvisioner(supabase)
      linkingInfo = await provisioner.provision({
        orgId,
        userId: user.id,
        connectionId,
        protocol,
      })
    }

    return NextResponse.json(linkingInfo, { status: 201 })
  } catch (err) {
    await supabase
      .from('org_connections')
      .update({ status: 'error', last_error: String(err), updated_at: new Date().toISOString() })
      .eq('id', connectionId)

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
