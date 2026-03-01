import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * WhatsApp session health monitoring.
 *
 * Provides connection status, session age, and activity tracking
 * for WhatsApp integration stability baseline.
 * Actual Baileys bridge implementation is Phase 15.
 */

export interface WhatsAppSessionStatus {
  connected: boolean
  sessionAge: number | null  // hours
  lastActivity: string | null  // ISO timestamp
  error?: string
}

/**
 * Check WhatsApp session health for an organization.
 * Queries whatsapp_sessions for active connection and whatsapp_outbox for last activity.
 */
export async function checkWhatsAppSession(
  supabase: SupabaseClient,
  orgId: string
): Promise<WhatsAppSessionStatus> {
  try {
    // Check for connected session
    const { data: session, error: sessionErr } = await supabase
      .from('whatsapp_sessions')
      .select('id, created_at, status')
      .eq('org_id', orgId)
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (sessionErr || !session) {
      return {
        connected: false,
        sessionAge: null,
        lastActivity: null,
        error: sessionErr?.code === 'PGRST116'
          ? 'No active WhatsApp session'
          : sessionErr?.message || 'No session found',
      }
    }

    // Compute session age in hours
    const createdAt = new Date(session.created_at as string)
    const ageMs = Date.now() - createdAt.getTime()
    const sessionAge = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10  // 1 decimal

    // Check last outbound activity
    const { data: lastMsg } = await supabase
      .from('whatsapp_outbox')
      .select('created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastActivity = lastMsg?.created_at as string | null

    return {
      connected: true,
      sessionAge,
      lastActivity: lastActivity || null,
    }
  } catch (err) {
    return {
      connected: false,
      sessionAge: null,
      lastActivity: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Log WhatsApp session health to the channel health infrastructure.
 * Uses storeHealthReports-compatible format via channel_health table.
 */
export async function logSessionHealth(
  supabase: SupabaseClient,
  orgId: string,
  status: WhatsAppSessionStatus
): Promise<void> {
  const healthStatus = status.connected ? 'healthy' : 'down'

  await supabase
    .from('channel_health')
    .upsert(
      {
        org_id: orgId,
        channel_type: 'whatsapp',
        status: healthStatus,
        latency_ms: 0,
        checked_at: new Date().toISOString(),
        error: status.error || null,
        metadata: {
          session_age_hours: status.sessionAge,
          last_activity: status.lastActivity,
          connection_stable: status.connected && (status.sessionAge ?? 0) > 0,
        },
      },
      { onConflict: 'org_id,channel_type' }
    )
}
