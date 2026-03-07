import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pollChannel } from '@/lib/channels/relay-daemon'
import { checkWhatsAppSession, logSessionHealth } from '@/lib/channels/whatsapp-monitor'
import type { ChannelType } from '@/lib/channels/types'
import type { PollResult } from '@/lib/channels/relay-daemon'
import type { WhatsAppSessionStatus } from '@/lib/channels/whatsapp-monitor'
import { logger } from '@/lib/core/logger';

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
 *
 * Response headers:
 * - X-Relay-Duration-Ms: total relay cycle duration
 * - X-Messages-Processed: total messages inserted across all channels
 * - X-Duplicates-Skipped: total duplicates detected across all channels
 */
export async function POST(request: NextRequest) {
  const relayStartMs = Date.now()

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

  const results: Record<string, PollResult> = {}
  let whatsappStatus: WhatsAppSessionStatus | null = null

  if (body.orgId) {
    // Poll specific org/channel
    const result = await pollChannel(supabase, body.orgId, body.channel || 'gmail')
    results[body.channel || 'gmail'] = result

    // WhatsApp session health check if applicable
    if (body.channel === 'whatsapp' || !body.channel) {
      try {
        whatsappStatus = await checkWhatsAppSession(supabase, body.orgId)
        await logSessionHealth(supabase, body.orgId, whatsappStatus)
      } catch (err) {
        logger.error('[relay] WhatsApp health check failed:', err)
      }
    }
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
    const whatsappOrgs = new Set<string>()

    for (const conn of connections || []) {
      // Skip channels polled more recently than their interval
      if (conn.last_sync) {
        const lastSyncMs = new Date(conn.last_sync).getTime()
        const intervalMs = (conn.poll_interval_seconds || 300) * 1000
        if (now - lastSyncMs < intervalMs) {
          const key = `${conn.org_id}:${conn.channel_type}`
          results[key] = { messagesFound: 0, messagesInserted: 0, skipped: true }
          continue
        }
      }

      const result = await pollChannel(supabase, conn.org_id, conn.channel_type as ChannelType)
      const key = `${conn.org_id}:${conn.channel_type}`
      results[key] = result

      // Track WhatsApp orgs for health check
      if (conn.channel_type === 'whatsapp') {
        whatsappOrgs.add(conn.org_id)
      }
    }

    // Run WhatsApp session health checks for all orgs with WhatsApp enabled
    for (const waOrgId of whatsappOrgs) {
      try {
        whatsappStatus = await checkWhatsAppSession(supabase, waOrgId)
        await logSessionHealth(supabase, waOrgId, whatsappStatus)
      } catch (err) {
        logger.error(`[relay] WhatsApp health check failed for org ${waOrgId}:`, err)
      }
    }
  }

  // Aggregate stats across all channels
  const allResults = Object.values(results)
  const totalMessages = allResults.reduce((sum, r) => sum + r.messagesInserted, 0)
  const totalDuplicates = allResults.reduce(
    (sum, r) => sum + (r.dedupStats ? r.dedupStats.externalId + r.dedupStats.contentHash : 0),
    0
  )
  const totalFound = allResults.reduce((sum, r) => sum + r.messagesFound, 0)

  // Burst alert: if total messages across all channels > 50, log warning
  if (totalFound > 50) {
    logger.warn(
      `[relay] Burst alert: ${totalFound} total messages across ${allResults.length} channels. All processed sequentially.`
    )
  }

  const relayDurationMs = Date.now() - relayStartMs

  // Build response with latency headers
  const response = NextResponse.json({
    results,
    summary: {
      totalFound,
      totalInserted: totalMessages,
      totalDuplicatesSkipped: totalDuplicates,
      durationMs: relayDurationMs,
      channelsPolled: allResults.length,
    },
    whatsappSession: whatsappStatus,
  })

  response.headers.set('X-Relay-Duration-Ms', String(relayDurationMs))
  response.headers.set('X-Messages-Processed', String(totalMessages))
  response.headers.set('X-Duplicates-Skipped', String(totalDuplicates))

  return response
}
