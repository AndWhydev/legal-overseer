import { Resend } from 'resend'
import { getAppUrl } from '@/lib/core/app-url'
import { logger } from '@/lib/core/logger';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'
}

function getToEmail(): string {
  return process.env.NOTIFICATION_TO_EMAIL || 'andy@allwebbedup.com.au'
}

function getDashboardUrl(): string {
  return `${getAppUrl()}/dashboard`
}

export async function sendApprovalEmail(
  approvalId: string,
  summary: string,
  agentName: string,
  confidence: number,
): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendApprovalEmail skipped: RESEND_API_KEY not configured')
      return false
    }

    const dashboardUrl = getDashboardUrl()
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Approval Needed</h2>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0;"><strong>Agent:</strong> ${agentName}</p>
          <p style="margin: 0 0 10px 0;"><strong>Summary:</strong> ${summary}</p>
          <p style="margin: 0;"><strong>Confidence:</strong> ${(confidence * 100).toFixed(0)}%</p>
        </div>

        <p style="margin-bottom: 20px;">
          <a href="${dashboardUrl}/approvals/${approvalId}" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            Review Approval
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin: 0;">
          This is an automated notification from Bitbit. Please review this approval in the dashboard.
        </p>
      </div>
    `

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [getToEmail()],
      subject: `Approval Needed: ${summary}`,
      html,
    })

    if (error) {
      logger.warn('sendApprovalEmail failed:', error)
      return false
    }

    return true
  } catch (err) {
    logger.warn('sendApprovalEmail error:', err)
    return false
  }
}

export async function sendEscalationEmail(
  alertId: string,
  summary: string,
  severity: string,
): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendEscalationEmail skipped: RESEND_API_KEY not configured')
      return false
    }

    const dashboardUrl = getDashboardUrl()
    const severityColor = severity === 'critical' ? '#dc3545' : severity === 'high' ? '#fd7e14' : '#ffc107'

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Sentry Escalation Alert</h2>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${severityColor};">
          <p style="margin: 0 0 10px 0;"><strong>Severity:</strong> <span style="color: ${severityColor}; font-weight: bold;">${severity.toUpperCase()}</span></p>
          <p style="margin: 0;"><strong>Alert:</strong> ${summary}</p>
        </div>

        <p style="margin-bottom: 20px;">
          <a href="${dashboardUrl}/alerts/${alertId}" style="display: inline-block; background: #dc3545; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            View Alert
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin: 0;">
          This is an urgent escalation from Sentry. Please review immediately.
        </p>
      </div>
    `

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [getToEmail()],
      subject: `[${severity.toUpperCase()}] Sentry Escalation: ${summary}`,
      html,
    })

    if (error) {
      logger.warn('sendEscalationEmail failed:', error)
      return false
    }

    return true
  } catch (err) {
    logger.warn('sendEscalationEmail error:', err)
    return false
  }
}

export async function sendDigestEmail(
  items: Array<{ id: string; summary: string; agentName: string }>,
): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendDigestEmail skipped: RESEND_API_KEY not configured')
      return false
    }

    if (items.length === 0) {
      return false
    }

    const dashboardUrl = getDashboardUrl()
    const itemsHtml = items
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 10px; text-align: left;">
            <a href="${dashboardUrl}/approvals/${item.id}" style="color: #007bff; text-decoration: none; font-weight: 500;">${item.summary}</a>
          </td>
          <td style="padding: 10px; text-align: left;">${item.agentName}</td>
        </tr>
      `,
      )
      .join('')

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Daily Approval Digest</h2>

        <p style="margin-bottom: 20px;">You have ${items.length} approval(s) pending:</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead style="background: #f5f5f5;">
            <tr>
              <th style="padding: 10px; text-align: left; font-weight: 600;">Action</th>
              <th style="padding: 10px; text-align: left; font-weight: 600;">Agent</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <p style="margin-bottom: 20px;">
          <a href="${dashboardUrl}/approvals" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            Review All Approvals
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin: 0;">
          This is an automated digest from Bitbit. Review your pending approvals in the dashboard.
        </p>
      </div>
    `

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [getToEmail()],
      subject: `Daily Approval Digest: ${items.length} items pending`,
      html,
    })

    if (error) {
      logger.warn('sendDigestEmail failed:', error)
      return false
    }

    return true
  } catch (err) {
    logger.warn('sendDigestEmail error:', err)
    return false
  }
}

/**
 * Send the lead acknowledgment message TO the lead's email address (outbound).
 * This is the actual delivery to the prospective client, not a notification to the org owner.
 * Returns the Resend message ID on success, or null on failure.
 */
export async function sendLeadAckEmailToRecipient(
  recipientEmail: string,
  draftBody: string,
  orgName?: string,
): Promise<string | null> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendLeadAckEmailToRecipient skipped: RESEND_API_KEY not configured')
      return null
    }

    const senderName = orgName ?? 'BitBit'
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <p style="font-size: 16px; line-height: 1.6; margin: 0;">
          ${draftBody.replace(/\n/g, '<br/>')}
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
          Sent by ${senderName}
        </p>
      </div>
    `

    const { data, error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [recipientEmail],
      subject: `Re: Your enquiry`,
      html,
    })

    if (error) {
      logger.warn('sendLeadAckEmailToRecipient failed:', error)
      return null
    }

    return data?.id ?? null
  } catch (err) {
    logger.warn('sendLeadAckEmailToRecipient error:', err)
    return null
  }
}

export async function sendLeadAckEmail(
  leadId: string,
  leadName: string,
  channel: string,
): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendLeadAckEmail skipped: RESEND_API_KEY not configured')
      return false
    }

    const dashboardUrl = getDashboardUrl()
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Lead Acknowledgment</h2>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0;"><strong>Lead Name:</strong> ${leadName}</p>
          <p style="margin: 0;"><strong>Channel:</strong> ${channel}</p>
        </div>

        <p style="margin-bottom: 20px;">
          A new lead has been acknowledged and is ready for follow-up.
        </p>

        <p style="margin-bottom: 20px;">
          <a href="${dashboardUrl}/leads/${leadId}" style="display: inline-block; background: #28a745; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            View Lead
          </a>
        </p>

        <p style="color: #666; font-size: 14px; margin: 0;">
          This is an automated notification from Bitbit.
        </p>
      </div>
    `

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [getToEmail()],
      subject: `Lead Acknowledged: ${leadName} (${channel})`,
      html,
    })

    if (error) {
      logger.warn('sendLeadAckEmail failed:', error)
      return false
    }

    return true
  } catch (err) {
    logger.warn('sendLeadAckEmail error:', err)
    return false
  }
}
