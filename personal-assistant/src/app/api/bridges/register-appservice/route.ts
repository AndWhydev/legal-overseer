import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey)

  const { connection_id, registration_yaml } = await request.json() as {
    connection_id: string
    registration_yaml: string
  }

  if (!connection_id || !registration_yaml) {
    return NextResponse.json({ error: 'connection_id and registration_yaml required' }, { status: 400 })
  }

  // Verify the connection exists
  const { data: conn } = await supabase
    .from('org_connections')
    .select('id, config')
    .eq('id', connection_id)
    .single()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Store registration YAML in config
  const existingConfig = (conn.config || {}) as Record<string, unknown>
  await supabase
    .from('org_connections')
    .update({
      config: {
        ...existingConfig,
        registration_yaml,
        registration_submitted_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection_id)

  return NextResponse.json({ ok: true })
}
