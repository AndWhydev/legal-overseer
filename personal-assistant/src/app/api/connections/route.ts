import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { generateBridgeToken, generateWebhookSecret } from '@/lib/connections'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections
 * List connections for the active org.
 */
export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const { data: connections, error } = await supabase
    .from('org_connections')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ connections: connections ?? [] })
}

/**
 * POST /api/connections
 * Create a new connection for the active org.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeOrgId = await getActiveOrgId(supabase, user.id)

  let body: {
    provider: string
    display_name: string
    transport: string
    template?: string
    config?: Record<string, unknown>
    org_id?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.provider || !body.display_name || !body.transport) {
    return NextResponse.json({ error: 'provider, display_name, and transport are required' }, { status: 400 })
  }

  const orgId = body.org_id ?? activeOrgId

  // Generate tokens based on transport
  const bridgeToken = body.transport === 'bridge' ? generateBridgeToken() : null
  const webhookSecret = body.transport === 'webhook' ? generateWebhookSecret() : null

  // Set capabilities based on transport
  const capabilities = body.transport === 'bridge'
    ? ['pull', 'push']
    : body.transport === 'webhook'
      ? ['webhook']
      : ['pull']

  const { data: connection, error } = await supabase
    .from('org_connections')
    .insert({
      org_id: orgId,
      provider: body.provider,
      display_name: body.display_name,
      transport: body.transport,
      template: body.template ?? null,
      config: body.config ?? {},
      status: 'connected',
      capabilities,
      bridge_token: bridgeToken,
      webhook_secret: webhookSecret,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ connection }, { status: 201 })
}
