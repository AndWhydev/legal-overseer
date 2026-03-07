/**
 * Onboarding Email Templates
 *
 * Template-based welcome and credential request emails for client onboarding.
 * Uses Resend via the shared email transport.
 */

import { Resend } from 'resend'
import { getAppUrl } from '@/lib/core/app-url'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@allwebbedup.com.au'
}

function getDashboardUrl(): string {
  return `${getAppUrl()}/dashboard`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WelcomeEmailInput {
  clientName: string
  clientEmail: string
  projectType: string
  projectTitle: string
  timeline: string
  orgName?: string
  credentialChecklist?: string[]
  kickoffBookingUrl?: string
}

export interface CredentialRequestInput {
  clientName: string
  clientEmail: string
  projectTitle: string
  credentials: Array<{ name: string; description: string; received: boolean }>
  orgName?: string
  reminderNumber?: number
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Welcome Email
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const orgName = input.orgName || 'All Webbed Up'
  const checklist = input.credentialChecklist || [
    'Hosting credentials (cPanel / SSH)',
    'Domain registrar access',
    'Existing website admin login',
    'Google Analytics / Search Console access',
    'Brand assets (logo files, brand guide)',
    'Content (text, images) for key pages',
  ]

  const checklistHtml = checklist
    .map((item) => `<li style="padding:4px 0;">${escapeHtml(item)}</li>`)
    .join('')

  const kickoffSection = input.kickoffBookingUrl
    ? `<p style="margin:20px 0;">
        <a href="${escapeHtml(input.kickoffBookingUrl)}" style="display:inline-block;background:#155dfc;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Schedule Kickoff Call
        </a>
      </p>`
    : ''

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <header style="padding:28px 24px;background:linear-gradient(135deg,#155dfc 0%,#0ea5e9 100%);">
      <h1 style="margin:0 0 4px;font-size:22px;color:#fff;">Welcome aboard!</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(orgName)}</p>
    </header>

    <section style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Hi ${escapeHtml(input.clientName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Thank you for choosing ${escapeHtml(orgName)}! We are excited to get started on
        <strong>${escapeHtml(input.projectTitle)}</strong>.
      </p>

      <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Project:</strong> ${escapeHtml(input.projectTitle)}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Type:</strong> ${escapeHtml(input.projectType.replace(/_/g, ' '))}</p>
        <p style="margin:0;font-size:14px;"><strong>Estimated Timeline:</strong> ${escapeHtml(input.timeline)}</p>
      </div>

      <h2 style="margin:0 0 12px;font-size:16px;">What we need from you</h2>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        To keep things moving, please share the following at your earliest convenience:
      </p>
      <ul style="margin:0 0 20px;padding:0 0 0 20px;font-size:14px;color:#334155;line-height:1.8;">
        ${checklistHtml}
      </ul>

      ${kickoffSection}

      <h2 style="margin:20px 0 12px;font-size:16px;">What happens next</h2>
      <ol style="margin:0 0 20px;padding:0 0 0 20px;font-size:14px;color:#334155;line-height:1.8;">
        <li>We will schedule a kickoff call to align on goals and timeline</li>
        <li>You will receive access to your project board to track progress</li>
        <li>Design/development begins once we have your credentials and content</li>
      </ol>

      <p style="margin:0;font-size:14px;color:#475569;">
        If you have any questions, just reply to this email. We are here to help!
      </p>
    </section>

    <footer style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;font-size:12px;color:#64748b;">Sent by ${escapeHtml(orgName)} via Bitbit</p>
    </footer>
  </div>
</body>
</html>`

  try {
    const { data, error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [input.clientEmail],
      subject: `Welcome to ${orgName} - ${input.projectTitle}`,
      html,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, messageId: data?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// Credential Request / Reminder Email
// ---------------------------------------------------------------------------

export async function sendCredentialRequestEmail(input: CredentialRequestInput): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const orgName = input.orgName || 'All Webbed Up'
  const isReminder = (input.reminderNumber ?? 0) > 0
  const pending = input.credentials.filter((c) => !c.received)
  const received = input.credentials.filter((c) => c.received)

  if (pending.length === 0) {
    return { success: true } // Nothing to request
  }

  const pendingHtml = pending
    .map((c) => `<li style="padding:4px 0;"><strong>${escapeHtml(c.name)}</strong> - ${escapeHtml(c.description)}</li>`)
    .join('')

  const receivedHtml = received.length > 0
    ? `<p style="margin:16px 0 8px;font-size:14px;color:#16a34a;"><strong>Already received (thank you!):</strong></p>
       <ul style="margin:0;padding:0 0 0 20px;font-size:13px;color:#475569;">${received.map((c) => `<li>${escapeHtml(c.name)}</li>`).join('')}</ul>`
    : ''

  const subjectPrefix = isReminder ? `Reminder #${input.reminderNumber}: ` : ''

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <header style="padding:24px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
      <h1 style="margin:0;font-size:20px;">${isReminder ? 'Credential Reminder' : 'Credential Request'}</h1>
    </header>

    <section style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${escapeHtml(input.clientName)},</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        ${isReminder
          ? `Just a friendly reminder - we still need a few credentials to continue work on <strong>${escapeHtml(input.projectTitle)}</strong>.`
          : `To get started on <strong>${escapeHtml(input.projectTitle)}</strong>, we need the following credentials:`}
      </p>

      <h3 style="margin:0 0 8px;font-size:15px;color:#dc2626;">Still needed:</h3>
      <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:14px;color:#334155;line-height:1.8;">
        ${pendingHtml}
      </ul>

      ${receivedHtml}

      <p style="margin:20px 0 0;font-size:14px;color:#475569;">
        Please reply to this email with the credentials or share them via a secure method of your choice.
      </p>
    </section>

    <footer style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;font-size:12px;color:#64748b;">Sent by ${escapeHtml(orgName)} via Bitbit</p>
    </footer>
  </div>
</body>
</html>`

  try {
    const { data, error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [input.clientEmail],
      subject: `${subjectPrefix}Credentials needed for ${input.projectTitle}`,
      html,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, messageId: data?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
