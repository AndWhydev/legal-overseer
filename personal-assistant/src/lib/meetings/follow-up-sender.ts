/**
 * Meeting Follow-Up Email Sender
 *
 * Sends approved follow-up emails via Resend.
 * Integrates with the existing email transport infrastructure.
 */

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { MeetingFollowUp } from './types'

function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'
}

/**
 * Send an approved follow-up email via Resend.
 * Updates the follow-up record with sent status and timestamp.
 */
export async function sendFollowUpEmail(
  supabase: SupabaseClient,
  followUp: MeetingFollowUp,
  meetingTitle: string
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[follow-up-sender] RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  if (followUp.status !== 'approved') {
    return { success: false, error: 'Follow-up must be approved before sending' }
  }

  const recipientEmail = followUp.recipient_email
  if (!recipientEmail) {
    return { success: false, error: 'No recipient email address' }
  }

  const subject = followUp.subject || `Meeting Follow-up: ${meetingTitle}`

  // Build HTML email from plain text body
  const bodyHtml = followUp.body
    .split('\n')
    .map(line => line.trim() === '' ? '<br/>' : `<p style="margin: 0 0 8px; line-height: 1.6;">${escapeHtml(line)}</p>`)
    .join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #333;">
      ${bodyHtml}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Sent via BitBit Meeting Intelligence
      </p>
    </div>
  `

  try {
    const { data, error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [recipientEmail],
      subject,
      html,
    })

    if (error) {
      logger.error('[follow-up-sender] Resend error:', error)

      await supabase
        .from('meeting_follow_ups')
        .update({ status: 'failed', metadata: { send_error: String(error) } })
        .eq('id', followUp.id)

      return { success: false, error: String(error) }
    }

    // Mark as sent
    await supabase
      .from('meeting_follow_ups')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { resend_id: data?.id },
      })
      .eq('id', followUp.id)

    logger.info('[follow-up-sender] Follow-up sent:', {
      followUpId: followUp.id,
      to: recipientEmail,
      resendId: data?.id,
    })

    return { success: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('[follow-up-sender] Send failed:', errorMsg)

    await supabase
      .from('meeting_follow_ups')
      .update({ status: 'failed', metadata: { send_error: errorMsg } })
      .eq('id', followUp.id)

    return { success: false, error: errorMsg }
  }
}

/**
 * Process all approved follow-ups for a meeting and send them.
 */
export async function sendPendingFollowUps(
  supabase: SupabaseClient,
  meetingId: string,
  meetingTitle: string
): Promise<{ sent: number; failed: number }> {
  const { data: followUps, error } = await supabase
    .from('meeting_follow_ups')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('status', 'approved')

  if (error || !followUps || followUps.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const followUp of followUps) {
    const result = await sendFollowUpEmail(
      supabase,
      followUp as MeetingFollowUp,
      meetingTitle
    )
    if (result.success) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
