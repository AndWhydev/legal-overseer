import type { SupabaseClient } from '@supabase/supabase-js'
import { getNotificationPreferences } from './preferences'
import {
  sendApprovalNeededEmail,
  sendAlertEscalationEmail,
  sendDailyDigestEmail,
  sendWeeklyReportEmail,
  type ApprovalEmailDetails,
  type AlertEscalationDetails,
  type DigestData,
  type WeeklyReportData,
} from './email-templates'
import { sendMessage as sendWhatsAppMessage } from '../channels/whatsapp'
import { humanize } from '@/lib/agent/response-guard'
import { logger } from '@/lib/core/logger';

export type NotificationType =
  | 'approval_needed'
  | 'approval_resolved'
  | 'alert_escalation'
  | 'lead_received'
  | 'invoice_sent'
  | 'agent_error'
  | 'daily_digest'
  | 'weekly_report'
  | 'info'

export type NotificationUrgency = 'critical' | 'high' | 'normal' | 'low'

export interface DispatchNotificationParams {
  orgId: string
  userId?: string
  type: NotificationType
  title: string
  body: string
  urgency?: NotificationUrgency
  channels?: ('dashboard' | 'whatsapp' | 'email')[]
  metadata?: Record<string, unknown>
}

export interface DispatchResult {
  dashboard: boolean
  whatsapp: boolean
  email: boolean
}

export async function dispatchNotification(
  supabase: SupabaseClient,
  params: DispatchNotificationParams,
): Promise<DispatchResult> {
  const urgency = params.urgency ?? 'normal'
  const result: DispatchResult = { dashboard: false, whatsapp: false, email: false }

  // Humanize all outbound notification text
  params = { ...params, title: humanize(params.title), body: humanize(params.body) }

  // Determine which channels to use
  let channels = params.channels ?? ['dashboard', 'email', 'whatsapp']

  // If we have a userId, respect their preferences
  if (params.userId) {
    try {
      const prefs = await getNotificationPreferences(supabase, params.userId)
      channels = channels.filter(ch => {
        if (ch === 'dashboard') return prefs.dashboard
        if (ch === 'email') return prefs.email
        if (ch === 'whatsapp') return prefs.whatsapp
        return true
      })
    } catch {
      // Preferences fetch failed, use requested channels as-is
    }
  }

  // Critical urgency always sends to all available channels regardless of prefs
  if (urgency === 'critical') {
    channels = params.channels ?? ['dashboard', 'email', 'whatsapp']
  }

  // Dashboard: insert into notifications table
  if (channels.includes('dashboard')) {
    try {
      const { error } = await supabase.from('notifications').insert({
        org_id: params.orgId,
        user_id: params.userId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        urgency,
        metadata: params.metadata ?? {},
        read: false,
      })
      result.dashboard = !error
      if (error) {
        logger.warn('[dispatcher] Dashboard notification insert failed:', error.message)
      }
    } catch (err) {
      logger.warn('[dispatcher] Dashboard notification error:', err)
    }
  }

  // WhatsApp
  if (channels.includes('whatsapp')) {
    try {
      const phone = process.env.WHATSAPP_ANDY_PHONE
      if (phone) {
        const text = `*${params.title}*\n\n${params.body}`
        const messageId = await sendWhatsAppMessage(phone, text)
        result.whatsapp = !!messageId
      }
    } catch (err) {
      logger.warn('[dispatcher] WhatsApp notification error:', err)
    }
  }

  // Email
  if (channels.includes('email')) {
    try {
      const toEmail = process.env.NOTIFICATION_TO_EMAIL || 'hi@torkay.com'
      // Route to specific templates for typed notifications
      if (params.type === 'approval_needed' && params.metadata) {
        const details = params.metadata as unknown as ApprovalEmailDetails
        result.email = await sendApprovalNeededEmail(toEmail, details)
      } else if (params.type === 'alert_escalation' && params.metadata) {
        const details = params.metadata as unknown as AlertEscalationDetails
        result.email = await sendAlertEscalationEmail(toEmail, details)
      } else if (params.type === 'daily_digest' && params.metadata) {
        const data = params.metadata as unknown as DigestData
        result.email = await sendDailyDigestEmail(toEmail, data)
      } else if (params.type === 'weekly_report' && params.metadata) {
        const data = params.metadata as unknown as WeeklyReportData
        result.email = await sendWeeklyReportEmail(toEmail, data)
      } else {
        // Generic email via Resend for other types
        const { Resend } = await import('resend')
        if (process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'
          const { error } = await resend.emails.send({
            from: fromEmail,
            to: [toEmail],
            subject: params.title,
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>${params.title}</h2>
              <p>${params.body}</p>
            </div>`,
          })
          result.email = !error
        }
      }
    } catch (err) {
      logger.warn('[dispatcher] Email notification error:', err)
    }
  }

  return result
}
