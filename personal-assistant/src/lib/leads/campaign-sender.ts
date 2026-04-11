/**
 * Campaign email sender: renders templates with lead data and sends via Resend.
 */
import { Resend } from 'resend'
import { logger } from '@/lib/core/logger'

export interface CampaignEmailPayload {
  to: string
  subject: string
  htmlBody: string
  fromEmail?: string
  fromName?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getDefaultFrom(): string {
  return process.env.CAMPAIGN_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'campaigns@bitbit.chat'
}

/**
 * Render a template with variable substitution.
 * Variables use {{variableName}} syntax.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    rendered = rendered.replace(pattern, value)
  }
  // Strip any remaining unresolved variables
  rendered = rendered.replace(/\{\{\s*\w+\s*\}\}/g, '')
  return rendered
}

/**
 * Build template variables from a lead's data.
 */
export function buildLeadVariables(lead: {
  prospect_name?: string | null
  prospect_domain?: string | null
  prospect_website?: string | null
  prospect_phone?: string | null
  prospect_emails?: string[] | null
  prospect_address?: string | null
  outreach_angle?: string | null
  priority_services?: string[] | null
  opportunity_notes?: string | null
}): Record<string, string> {
  const name = lead.prospect_name ?? 'there'
  const firstName = name.split(' ')[0] ?? name

  return {
    name,
    firstName,
    company: lead.prospect_name ?? '',
    domain: lead.prospect_domain ?? '',
    website: lead.prospect_website ?? '',
    phone: lead.prospect_phone ?? '',
    email: lead.prospect_emails?.[0] ?? '',
    address: lead.prospect_address ?? '',
    outreachAngle: lead.outreach_angle ?? '',
    services: lead.priority_services?.join(', ') ?? '',
    opportunityNotes: lead.opportunity_notes ?? '',
  }
}

/**
 * Send a single campaign email via Resend.
 */
export async function sendCampaignEmail(
  payload: CampaignEmailPayload,
): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('sendCampaignEmail skipped: RESEND_API_KEY not configured')
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const from = payload.fromName
      ? `${payload.fromName} <${payload.fromEmail ?? getDefaultFrom()}>`
      : payload.fromEmail ?? getDefaultFrom()

    const { data, error } = await getResend().emails.send({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.htmlBody,
      replyTo: payload.replyTo,
      tags: payload.tags,
      headers: {
        'List-Unsubscribe': '<mailto:unsubscribe@bitbit.chat>, <https://app.bitbit.chat/settings/notifications>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })

    if (error) {
      logger.warn('sendCampaignEmail failed:', error)
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    logger.warn('sendCampaignEmail error:', err)
    return { success: false, error: message }
  }
}
