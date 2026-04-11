import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { sendCommandReplyEmail } from '@/lib/email/email-transport'
import { getAppUrl } from '@/lib/core/app-url'

/**
 * Dunning state tracking
 */
interface DunningState {
  step: number // 0, 1, 3, 7, 14
  lastEmailSentAt: string | null
}

const DUNNING_SEQUENCE = {
  0: { days: 0, action: 'initial_failed' },
  1: { days: 1, action: 'first_email' },
  3: { days: 3, action: 'second_email_banner' },
  7: { days: 7, action: 'grace_warning' },
  14: { days: 14, action: 'downgrade_free' },
}

/**
 * Get or initialize dunning state from subscription metadata
 */
function getDunningState(metadata: Record<string, unknown> | null): DunningState {
  if (!metadata || typeof metadata !== 'object') {
    return { step: 0, lastEmailSentAt: null }
  }

  const dunning = (metadata as Record<string, unknown>).dunning
  if (!dunning || typeof dunning !== 'object') {
    return { step: 0, lastEmailSentAt: null }
  }

  return {
    step: (dunning as any).step ?? 0,
    lastEmailSentAt: (dunning as any).lastEmailSentAt ?? null,
  }
}

/**
 * Update dunning state in subscription metadata
 */
async function updateDunningState(
  supabase: SupabaseClient,
  orgId: string,
  newState: DunningState,
): Promise<void> {
  try {
    const { data: sub, error: fetchError } = await supabase
      .from('subscriptions')
      .select('metadata')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !sub) {
      logger.warn('[dunning] Could not fetch subscription for org:', orgId, fetchError?.message)
      return
    }

    const metadata = (sub.metadata as Record<string, unknown>) || {}
    metadata.dunning = newState

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      logger.warn('[dunning] Failed to update dunning state:', updateError.message)
    }
  } catch (err) {
    logger.error('[dunning] Error updating dunning state:', err)
  }
}

/**
 * Build payment update link for organization
 */
function getPaymentUpdateLink(orgId: string): string {
  try {
    return `${getAppUrl()}/dashboard/billing?org=${orgId}&action=update-payment`
  } catch {
    return 'https://app.bitbit.chat/dashboard/billing'
  }
}

/**
 * Send payment recovery email
 */
async function sendPaymentRecoveryEmail(
  orgName: string,
  orgEmail: string,
  step: number,
): Promise<void> {
  const paymentLink = getPaymentUpdateLink('') // Use general link
  let subject = ''
  let htmlBody = ''

  if (step === 1) {
    subject = 'Payment Failed - Update Required'
    htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Payment Failed</h2>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Your recent payment for <strong>${orgName}</strong> could not be processed.
          Please update your payment method to continue service.
        </p>
        <p style="margin-bottom: 20px;">
          <a href="${paymentLink}" style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            Update Payment Method
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin: 0;">
          If you don't update your payment method within 14 days, your service will be downgraded to the free tier.
        </p>
      </div>
    `
  } else if (step === 3) {
    subject = 'Action Required - Update Payment to Keep Service Active'
    htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #f59e0b; margin-bottom: 20px;">Action Required - Payment Update</h2>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          This is a reminder that we still haven't received payment for <strong>${orgName}</strong>.
          Your paid features are currently at risk.
        </p>
        <p style="margin-bottom: 20px;">
          <a href="${paymentLink}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            Update Payment Now
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin: 0;">
          You have 11 days left before your service is downgraded to the free tier.
        </p>
      </div>
    `
  } else if (step === 7) {
    subject = 'Final Notice - Update Payment Within 7 Days'
    htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #ef4444; margin-bottom: 20px;">Final Notice - Grace Period Ending</h2>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          This is your final notice regarding the overdue payment for <strong>${orgName}</strong>.
          If payment is not received within 7 days, your account will be downgraded.
        </p>
        <p style="margin-bottom: 20px;">
          <a href="${paymentLink}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500;">
            Update Payment Immediately
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin: 0;">
          Please act now to avoid losing access to your paid features.
        </p>
      </div>
    `
  }

  if (subject && htmlBody) {
    try {
      await sendCommandReplyEmail(orgEmail, subject, htmlBody)
      logger.info(`[dunning] Sent step ${step} email to ${orgEmail}`)
    } catch (err) {
      logger.warn(`[dunning] Failed to send step ${step} email:`, err)
    }
  }
}

/**
 * Handle payment failure event from Stripe webhook
 * Triggered by invoice.payment_failed event
 */
export async function handlePaymentFailed(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  errorMessage: string,
): Promise<void> {
  try {
    logger.info('[dunning] Payment failed for org:', orgId, 'invoice:', invoiceId)

    // Update subscription status to past_due
    const { data: sub, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, metadata')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !sub) {
      logger.warn('[dunning] Could not find subscription for org:', orgId)
      return
    }

    // Initialize dunning state
    const dunningState: DunningState = {
      step: 0,
      lastEmailSentAt: new Date().toISOString(),
    }

    const metadata = ((sub.metadata as Record<string, unknown>) || {}) as Record<string, unknown>
    metadata.dunning = dunningState
    metadata.payment_failed_at = new Date().toISOString()
    metadata.payment_error = errorMessage

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      logger.error('[dunning] Failed to update subscription status:', updateError.message)
      return
    }

    logger.info('[dunning] Subscription marked as past_due for org:', orgId)
  } catch (err) {
    logger.error('[dunning] Error handling payment failure:', err)
  }
}

/**
 * Process dunning sequence for all past_due subscriptions
 * Should be called periodically (e.g., every hour or via cron job)
 */
export async function processDunningSequence(supabase: SupabaseClient): Promise<void> {
  try {
    logger.info('[dunning] Starting dunning sequence processing')

    // Fetch all past_due subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, org_id, metadata, status, created_at')
      .eq('status', 'past_due')

    if (fetchError) {
      logger.error('[dunning] Failed to fetch past_due subscriptions:', fetchError.message)
      return
    }

    if (!subscriptions || subscriptions.length === 0) {
      logger.info('[dunning] No past_due subscriptions to process')
      return
    }

    for (const sub of subscriptions) {
      try {
        const dunningState = getDunningState(sub.metadata as Record<string, unknown> | null)
        const paymentFailedAt = sub.metadata
          ? (sub.metadata as Record<string, unknown>).payment_failed_at
          : null

        if (!paymentFailedAt) {
          logger.warn('[dunning] No payment_failed_at in subscription:', sub.id)
          continue
        }

        const failedDate = new Date(paymentFailedAt as string)
        const now = new Date()
        const daysSinceFailure = Math.floor(
          (now.getTime() - failedDate.getTime()) / (24 * 60 * 60 * 1000),
        )

        logger.info(
          `[dunning] Subscription ${sub.id} (org: ${sub.org_id}) - days since failure: ${daysSinceFailure}, current step: ${dunningState.step}`,
        )

        // Get organization details for email
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('name, metadata')
          .eq('id', sub.org_id)
          .single()

        if (orgError || !org) {
          logger.warn('[dunning] Could not find organization:', sub.org_id)
          continue
        }

        const orgName = (org as Record<string, unknown>).name as string
        const orgMeta = (org as Record<string, unknown>).metadata as Record<string, unknown> | null
        const billingEmail =
          orgMeta && typeof orgMeta === 'object' && 'billing_email' in orgMeta
            ? (orgMeta.billing_email as string)
            : 'billing@example.com'

        // Execute dunning actions based on days elapsed
        if (daysSinceFailure >= 1 && dunningState.step < 1) {
          logger.info(`[dunning] Executing step 1 (day 1 email) for org: ${sub.org_id}`)
          await sendPaymentRecoveryEmail(orgName, billingEmail, 1)
          dunningState.step = 1
          dunningState.lastEmailSentAt = new Date().toISOString()
          await updateDunningState(supabase, sub.org_id, dunningState)
        }

        if (daysSinceFailure >= 3 && dunningState.step < 3) {
          logger.info(`[dunning] Executing step 3 (day 3 email + banner) for org: ${sub.org_id}`)
          await sendPaymentRecoveryEmail(orgName, billingEmail, 3)
          dunningState.step = 3
          dunningState.lastEmailSentAt = new Date().toISOString()

          // Set in-app banner flag
          const metadata = ((sub.metadata as Record<string, unknown>) || {}) as Record<
            string,
            unknown
          >
          metadata.show_payment_banner = true

          await supabase
            .from('subscriptions')
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq('id', sub.id)

          await updateDunningState(supabase, sub.org_id, dunningState)
        }

        if (daysSinceFailure >= 7 && dunningState.step < 7) {
          logger.info(`[dunning] Executing step 7 (grace warning) for org: ${sub.org_id}`)
          await sendPaymentRecoveryEmail(orgName, billingEmail, 7)
          dunningState.step = 7
          dunningState.lastEmailSentAt = new Date().toISOString()
          await updateDunningState(supabase, sub.org_id, dunningState)
        }

        if (daysSinceFailure >= 14 && dunningState.step < 14) {
          logger.info(`[dunning] Executing step 14 (downgrade to free) for org: ${sub.org_id}`)
          // Downgrade to free tier
          const { error: downgradeError } = await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              plan: 'free',
              metadata: {
                ...sub.metadata,
                downgraded_at: new Date().toISOString(),
                downgrade_reason: 'payment_failed_dunning_expired',
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id)

          if (downgradeError) {
            logger.error('[dunning] Failed to downgrade subscription:', downgradeError.message)
          } else {
            logger.info(`[dunning] Successfully downgraded org to free tier: ${sub.org_id}`)
            dunningState.step = 14
            dunningState.lastEmailSentAt = new Date().toISOString()
            await updateDunningState(supabase, sub.org_id, dunningState)
          }
        }
      } catch (err) {
        logger.error(`[dunning] Error processing subscription ${sub.id}:`, err)
      }
    }

    logger.info('[dunning] Finished dunning sequence processing')
  } catch (err) {
    logger.error('[dunning] Error in processDunningSequence:', err)
  }
}

/**
 * Reset dunning state when payment is successfully recovered
 */
export async function resetDunningState(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  try {
    logger.info('[dunning] Resetting dunning state for org:', orgId)

    const { data: sub, error: fetchError } = await supabase
      .from('subscriptions')
      .select('metadata')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !sub) {
      logger.warn('[dunning] Could not find subscription for org:', orgId)
      return
    }

    const metadata = ((sub.metadata as Record<string, unknown>) || {}) as Record<string, unknown>
    // Remove dunning state but keep history
    metadata.dunning_recovered_at = new Date().toISOString()
    delete metadata.dunning
    delete metadata.payment_failed_at
    delete metadata.payment_error
    delete metadata.show_payment_banner

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      logger.error('[dunning] Failed to reset dunning state:', updateError.message)
      return
    }

    logger.info('[dunning] Dunning state reset for org:', orgId)
  } catch (err) {
    logger.error('[dunning] Error resetting dunning state:', err)
  }
}
