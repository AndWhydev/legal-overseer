import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storeOrgCredential } from '@/lib/integrations/credentials'
import { logAuditEvent } from '@/lib/audit/logger'
import { getActiveOrgId } from '@/lib/tenancy'
import { checkPlanGate } from '@/lib/billing/plan-gates'
import { getAppUrl } from '@/lib/core/app-url'

const OAUTH_PROVIDER_MAP: Record<string, string> = {
  gmail: 'gmail',
  outlook: 'outlook',
  asana: 'asana',
  calendly: 'calendly',
  calendar: 'google-calendar',
  'google-calendar': 'google-calendar',
  ga4: 'google-analytics',
  'google-analytics': 'google-analytics',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use dual-tier tenancy: resolve active org for this user
  const orgId = await getActiveOrgId(supabase, user.id)

  let body: { channel: string; credentials?: Record<string, string> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { channel, credentials } = body
  if (!channel || typeof channel !== 'string') {
    return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  }

  const channelLower = channel.toLowerCase()

  // Enforce plan gate: check if org has remaining channel slots
  const allowed = await checkPlanGate(supabase, orgId, 'channels')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Channel limit reached for your plan. Upgrade to connect more channels.' },
      { status: 403 },
    )
  }

  try {
    // OAuth channels: redirect to OAuth start flow
    const oauthProvider = OAUTH_PROVIDER_MAP[channelLower]
    if (oauthProvider) {
      const appUrl = getAppUrl()
      const url = `${appUrl}/api/auth/oauth/start?provider=${oauthProvider}`
      return NextResponse.json({ redirect: true, url })
    }

    // Stripe (API key channel)
    if (channelLower === 'stripe') {
      if (!credentials?.secret_key) {
        return NextResponse.json({ error: 'credentials.secret_key is required for Stripe' }, { status: 400 })
      }

      await storeOrgCredential(supabase, orgId, channelLower, credentials, user.id)

      // Upsert channel_connections row
      await supabase.from('channel_connections').upsert(
        {
          org_id: orgId,
          channel_type: channelLower,
          status: 'connected',
          relay_enabled: false,
          config: {},
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,channel_type' },
      )

      await logAuditEvent(supabase, {
        orgId,
        actorType: 'user',
        actorId: user.id,
        action: 'created',
        entityType: 'channel_connection',
        entityId: channelLower,
        metadata: { channel: channelLower, method: 'api_key' },
      })

      return NextResponse.json({ connected: true, channel: channelLower })
    }

    // WhatsApp: create pairing session
    if (channelLower === 'whatsapp') {
      const { data: session, error: sessionError } = await supabase
        .from('whatsapp_sessions')
        .insert({
          org_id: orgId,
          status: 'pairing',
          created_by: user.id,
        })
        .select('id')
        .single()

      if (sessionError) {
        throw new Error(`Failed to create WhatsApp session: ${sessionError.message}`)
      }

      await logAuditEvent(supabase, {
        orgId,
        actorType: 'user',
        actorId: user.id,
        action: 'created',
        entityType: 'channel_connection',
        entityId: channelLower,
        metadata: { channel: channelLower, method: 'qr_pairing', sessionId: session.id },
      })

      return NextResponse.json({ pairing: true, sessionId: session.id })
    }

    return NextResponse.json({ error: `Unsupported channel: ${channel}` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect channel'
    logger.error('[channels/connect]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
