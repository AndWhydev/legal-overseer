import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessage } from '../channels/whatsapp'
import { formatResponse } from './response-formatter'

export type AlertType = 'high_value_lead' | 'invoice_overdue' | 'negative_sentiment' | 'approval_urgent'

export interface ProactiveAlert {
  type: AlertType
  title: string
  detail: string
  action?: string
  metadata?: Record<string, unknown>
}

/**
 * Send a proactive alert to the owner's WhatsApp.
 * Called by agents/crons when significant events occur.
 */
export async function sendProactiveAlert(
  recipientPhone: string,
  alert: ProactiveAlert
): Promise<string | null> {
  const emoji = alertEmoji(alert.type)
  const message = formatResponse.proactiveAlert(emoji, alert.title, alert.detail, alert.action)
  return sendMessage(recipientPhone, message)
}

/**
 * Check for conditions that warrant proactive alerts and send them.
 * Designed to be called from a cron job (e.g., every 15 minutes).
 */
export async function checkAndSendAlerts(
  supabase: SupabaseClient,
  orgId: string,
  recipientPhone: string
): Promise<number> {
  const alerts = await gatherAlerts(supabase, orgId)
  let sent = 0

  for (const alert of alerts) {
    // Deduplicate: check if we already sent this alert recently
    const isDuplicate = await isRecentlySent(supabase, orgId, alert)
    if (isDuplicate) continue

    const messageId = await sendProactiveAlert(recipientPhone, alert)
    if (messageId) {
      await recordAlertSent(supabase, orgId, alert)
      sent++
    }
  }

  return sent
}

async function gatherAlerts(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = []

  const [overdueAlerts, leadAlerts] = await Promise.all([
    checkNewOverdueInvoices(supabase, orgId),
    checkHighValueLeads(supabase, orgId),
  ])

  alerts.push(...overdueAlerts)
  alerts.push(...leadAlerts)

  return alerts
}

async function checkNewOverdueInvoices(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProactiveAlert[]> {
  try {
    // Invoices that became overdue in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, total, due_date, client_contact_id, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .gte('updated_at', oneHourAgo)
      .limit(3)

    if (!data?.length) return []

    return data.map((inv: Record<string, unknown>) => {
      const contact = inv.contacts as { name: string } | null
      const name = contact?.name ?? 'Unknown'
      return {
        type: 'invoice_overdue' as AlertType,
        title: 'Invoice Overdue',
        detail: `Invoice #${inv.invoice_number} for *${name}* ($${inv.total}) is now overdue.`,
        action: 'Reply "invoices" to see all overdue items.',
        metadata: { invoice_number: inv.invoice_number },
      }
    })
  } catch {
    return []
  }
}

async function checkHighValueLeads(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProactiveAlert[]> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Check leads table
    const { data: leads } = await supabase
      .from('leads')
      .select('id, score, source_channel, metadata')
      .eq('org_id', orgId)
      .gte('created_at', oneHourAgo)
      .eq('score', 'hot')
      .limit(3)

    if (!leads?.length) return []

    return leads.map((lead: Record<string, unknown>) => {
      const meta = (lead.metadata || {}) as Record<string, unknown>
      const displayName = (meta.name || meta.company || lead.source_channel || 'Unknown') as string
      return {
        type: 'high_value_lead' as AlertType,
        title: 'High-Value Lead',
        detail: `New lead: *${displayName}* (score: ${lead.score}) via ${lead.source_channel}`,
        action: 'Reply "leads" to view pipeline.',
        metadata: { lead_id: lead.id },
      }
    })
  } catch {
    return []
  }
}

async function isRecentlySent(
  supabase: SupabaseClient,
  orgId: string,
  alert: ProactiveAlert
): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from('activity_feed')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('action_type', 'system')
      .eq('action', `proactive_alert:${alert.type}`)
      .gte('created_at', oneHourAgo)

    return (count ?? 0) > 0
  } catch {
    return false
  }
}

async function recordAlertSent(
  supabase: SupabaseClient,
  orgId: string,
  alert: ProactiveAlert
): Promise<void> {
  try {
    await supabase.from('activity_feed').insert({
      org_id: orgId,
      action_type: 'system',
      action: `proactive_alert:${alert.type}`,
      result: alert.title,
    })
  } catch {
    // Non-critical, just log
    logger.warn('[proactive-alerts] Failed to record alert sent')
  }
}

function alertEmoji(type: AlertType): string {
  const map: Record<AlertType, string> = {
    high_value_lead: '🔥',
    invoice_overdue: '💰',
    negative_sentiment: '⚠️',
    approval_urgent: '🚨',
  }
  return map[type] ?? '📢'
}
