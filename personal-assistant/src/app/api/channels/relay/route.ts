import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pollChannel } from '@/lib/channels/relay-daemon'
import type { ChannelType } from '@/lib/channels/types'
import type { PollResult } from '@/lib/channels/relay-daemon'

// Allow up to 60s for Vercel Pro plan
export const maxDuration = 60

/**
 * POST /api/channels/relay
 *
 * Trigger channel relay polling. Designed to be called by:
 * 1. Vercel Cron (vercel.json cron config)
 * 2. External cron (e.g., Hetzner VPS hitting this endpoint)
 * 3. Manual trigger via curl for testing
 *
 * Body (optional): { orgId?: string, channel?: ChannelType }
 * If omitted, polls ALL orgs with relay_enabled channels.
 *
 * Auth: Bearer token via RELAY_SECRET env var.
 */
export async function POST(request: NextRequest) {
  // Bearer token auth
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.RELAY_SECRET
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service-role Supabase client (created at HTTP boundary per DI pattern)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  let body: { orgId?: string; channel?: ChannelType } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is valid -- poll all
  }

  const results: PollResult[] = []

  if (body.orgId) {
    // Poll specific org/channel
    const result = await pollChannel(supabase, body.orgId, body.channel || 'gmail')
    results.push(result)
  } else {
    // Poll all orgs with relay_enabled channels
    const { data: connections, error } = await supabase
      .from('channel_connections')
      .select('org_id, channel_type, poll_interval_seconds, last_sync')
      .eq('relay_enabled', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const now = Date.now()
    for (const conn of connections || []) {
      // Skip channels polled more recently than their interval
      if (conn.last_sync) {
        const lastSyncMs = new Date(conn.last_sync).getTime()
        const intervalMs = (conn.poll_interval_seconds || 300) * 1000
        if (now - lastSyncMs < intervalMs) {
          results.push({ messagesFound: 0, messagesInserted: 0, skipped: true })
          continue
        }
      }

      const result = await pollChannel(supabase, conn.org_id, conn.channel_type as ChannelType)
      results.push(result)
    }
  }

  return NextResponse.json({ results })
}
