import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storeOrgCredential } from '@/lib/integrations/credentials'
import { logAuditEvent } from '@/lib/audit/logger'
import { getActiveOrgId } from '@/lib/tenancy'
import { checkPlanGate } from '@/lib/billing/plan-gates'
import { logger } from '@/lib/core/logger';
import { pollChannel } from '@/lib/channels/relay-daemon';
import type { ChannelType } from '@/lib/channels/types';

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

function getConnectionChannelType(channel: string): string {
  switch (channel) {
    case 'google-calendar':
      return 'calendar'
    case 'google-analytics':
    case 'ga4':
      return 'gsc'
    default:
      return channel
  }
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
      const url = `/api/auth/oauth/start?provider=${encodeURIComponent(oauthProvider)}`
      return NextResponse.json({ redirect: true, url })
    }

    // Stripe (API key channel)
    if (channelLower === 'stripe') {
      if (!credentials?.secret_key) {
        return NextResponse.json({ error: 'credentials.secret_key is required for Stripe' }, { status: 400 })
      }

      await storeOrgCredential(supabase, orgId, channelLower, credentials, user.id)

      const connectionChannelType = getConnectionChannelType(channelLower)
      const { data: existingConnection } = await supabase
        .from('channel_connections')
        .select('config, last_sync, message_count')
        .eq('org_id', orgId)
        .eq('channel_type', connectionChannelType)
        .maybeSingle<{
          config?: Record<string, unknown> | null
          last_sync?: string | null
          message_count?: number | null
        }>()

      // Upsert channel_connections row and preserve any fallback credential config.
      await supabase.from('channel_connections').upsert(
        {
          org_id: orgId,
          channel_type: connectionChannelType,
          status: 'connected',
          relay_enabled: true,
          config: existingConnection?.config ?? {},
          last_sync: existingConnection?.last_sync ?? null,
          message_count: existingConnection?.message_count ?? 0,
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

      // Trigger immediate sync so messages appear without waiting for 5-min cron
      pollChannel(supabase, orgId, connectionChannelType as ChannelType).catch((err) => {
        logger.error('[channels/connect] immediate sync failed:', err)
      })

      return NextResponse.json({ connected: true, channel: channelLower })
    }

    // WhatsApp: pairing is owned by the bridge route so session creation stays single-source-of-truth.
    if (channelLower === 'whatsapp') {
      return NextResponse.json({ pairing: true, channel: channelLower })
    }

    return NextResponse.json({ error: `Unsupported channel: ${channel}` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect channel'
    logger.error('[channels/connect]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
