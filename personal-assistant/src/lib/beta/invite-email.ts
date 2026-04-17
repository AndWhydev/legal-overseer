import { Resend } from 'resend'
import { getAppUrl } from '@/lib/core/app-url'
import { logger } from '@/lib/core/logger'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

function getFromEmail(): string {
  return process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'
}

/**
 * Send a beta invite email to a waitlist user with their unique invite code.
 * The email contains a signup link that pre-fills the invite code.
 */
export async function sendBetaInviteEmail(
  recipientEmail: string,
  inviteCode: string,
): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('[beta-invite-email] RESEND_API_KEY not configured')
      return false
    }

    const appUrl = getAppUrl()
    const signupUrl = `${appUrl}/onboard?code=${encodeURIComponent(inviteCode)}`

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #F1F5F9; background: #0a0f1a;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 8px 0; color: #F1F5F9;">
            You're In
          </h1>
          <p style="font-size: 16px; color: #94A3B8; margin: 0;">
            Welcome to the BitBit Beta
          </p>
        </div>

        <div style="background: rgba(15, 20, 30, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px 0; color: #CBD5E1;">
            We've been building an AI operations platform that understands your business better than you do.
            As a beta tester, you get early access to shape what BitBit becomes.
          </p>

          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px 0; color: #CBD5E1;">
            Your invite code:
          </p>

          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px 16px; text-align: center; margin-bottom: 16px;">
            <code style="font-size: 20px; font-weight: 600; letter-spacing: 2px; color: #F1F5F9;">
              ${inviteCode}
            </code>
          </div>

          <p style="font-size: 14px; color: #64748B; margin: 0;">
            This code expires in 7 days and can only be used once.
          </p>
        </div>

        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${signupUrl}" style="display: inline-block; background: #F1F5F9; color: #0a0f1a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Get Started
          </a>
        </div>

        <div style="background: rgba(15, 20, 30, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 16px; padding: 20px; margin-bottom: 24px;">
          <h3 style="font-size: 14px; font-weight: 600; color: #94A3B8; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">
            What to expect
          </h3>
          <ul style="margin: 0; padding: 0 0 0 20px; color: #CBD5E1; font-size: 14px; line-height: 2;">
            <li>Daily tips to get the most out of BitBit</li>
            <li>Direct feedback channel to the dev team</li>
            <li>First month on us with your personal invite code at checkout</li>
            <li>Shape the product roadmap with your input</li>
          </ul>
        </div>

        <p style="text-align: center; color: #475569; font-size: 12px; margin: 0;">
          BitBit -- AI operations for small business
        </p>
      </div>
    `

    const { error } = await getResend().emails.send({
      from: getFromEmail(),
      to: [recipientEmail],
      subject: "You're in -- BitBit Beta Access",
      html,
    })

    if (error) {
      logger.warn('[beta-invite-email] Send failed', { error, email: recipientEmail.replace(/@.*/, '@...') })
      return false
    }

    logger.info('[beta-invite-email] Sent', { email: recipientEmail.replace(/@.*/, '@...') })
    return true
  } catch (err) {
    logger.warn('[beta-invite-email] Error', { error: err })
    return false
  }
}
