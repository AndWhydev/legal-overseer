import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTierFromPrice, stripe } from './stripe-client'
import {
  handlePaymentFailed as triggerDunning,
  resetDunningState,
} from './dunning'
import { sendCommandReplyEmail } from '@/lib/email/email-transport'
import { getAppUrl } from '@/lib/core/app-url'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Helpers (migrated from /api/webhooks/stripe/route.ts)
// ---------------------------------------------------------------------------

/**
 * Log webhook event to webhook_events table.
 * Preserved from the legacy /api/webhooks/stripe endpoint.
 */
export async function logWebhookEvent(
  supabase: SupabaseClient,
  source: string,
  eventType: string,
  externalEventId: string | null,
  payload: Record<string, unknown>,
  status: string,
  responseCode?: number,
  errorMessage?: string,
): Promise<void> {
  try {
    await supabase.from('webhook_events').insert({
      source,
      event_type: eventType,
      external_event_id: externalEventId,
      payload,
      status,
      response_code: responseCode,
      error_message: errorMessage,
      processed_at:
        status === 'success' || status === 'failed'
          ? new Date().toISOString()
          : null,
    })
  } catch (err) {
    logger.warn('[subscription-handler] Failed to log webhook event:', err)
  }
}

/**
 * Update invoice status and create timeline event.
 * Preserved from the legacy /api/webhooks/stripe endpoint.
 */
async function updateInvoiceStatus(
  supabase: SupabaseClient,
  orgId: string,
  stripePaymentLinkOrId: string,
  newStatus: 'paid' | 'failed' | 'overdue',
): Promise<void> {
  try {
    const { data: invoice, error: findError } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('org_id', orgId)
      .or(`stripe_payment_link.eq.${stripePaymentLinkOrId}`)
      .single() as {
      data: { id: string; invoice_number: string } | null
      error: { message: string } | null
    }

    if (findError || !invoice) {
      logger.warn(
        '[subscription-handler] Could not find invoice for Stripe ID:',
        stripePaymentLinkOrId,
        findError?.message,
      )
      return
    }

    const { error: updateError } = await (supabase as unknown as SupabaseClient)
      .from('invoices')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'paid' && {
          paid_date: new Date().toISOString().split('T')[0],
        }),
      })
      .eq('id', invoice.id)

    if (updateError) {
      logger.error(
        '[subscription-handler] Failed to update invoice:',
        updateError.message,
      )
      return
    }

    const eventType =
      newStatus === 'paid' ? 'invoice_paid' : 'invoice_failed'
    const { error: timelineError } = await (
      supabase as unknown as SupabaseClient
    )
      .from('entity_timeline')
      .insert({
        org_id: orgId,
        entity_type: 'invoice',
        entity_id: invoice.id,
        event_type: eventType,
        event_data: {
          stripe_event: true,
          new_status: newStatus,
          invoice_number: invoice.invoice_number,
        },
        occurred_at: new Date().toISOString(),
      } as Record<string, unknown>)

    if (timelineError) {
      logger.warn(
        '[subscription-handler] Failed to create timeline event:',
        timelineError.message,
      )
    } else {
      logger.info(
        `[subscription-handler] Updated invoice ${invoice.invoice_number} to status: ${newStatus}`,
      )
    }
  } catch (err) {
    logger.error('[subscription-handler] Error updating invoice:', err)
  }
}

// ---------------------------------------------------------------------------
// Extract org_id from subscription (DB lookup + metadata fallback)
// ---------------------------------------------------------------------------

async function resolveOrgId(
  supabase: SupabaseClient,
  subscriptionId: string,
  metadata: Record<string, string>,
): Promise<string | null> {
  // Try DB lookup first
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('org_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()

  if (sub?.org_id) return sub.org_id as string

  // Fall back to metadata
  return metadata.org_id ?? null
}

// ---------------------------------------------------------------------------
// Subscription lifecycle handler
// ---------------------------------------------------------------------------

/**
 * Handle customer.subscription.created / updated / deleted events.
 * CRITICAL: All upserts write to the `plan` column, never `tier`.
 */
export async function handleSubscriptionLifecycle(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const sub = event.data.object as unknown as Record<string, unknown>
  const subscriptionId = sub.id as string
  const customerId = sub.customer as string
  const status = sub.status as string
  const metadata = (sub.metadata ?? {}) as Record<string, string>
  const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined
  const priceId = items?.data?.[0]?.price?.id ?? ''
  const currentPeriodEnd = sub.current_period_end as number

  const eventAction = event.type.split('.').pop() // created | updated | deleted

  if (eventAction === 'created') {
    // For "created" events, subscription row may not exist yet.
    // Extract org_id from metadata (set during checkout).
    const orgId = await resolveOrgId(supabase, subscriptionId, metadata)
    const tier = resolveTierFromPrice(priceId, metadata.tier)

    await supabase.from('subscriptions').upsert({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      org_id: orgId,
      plan: tier,
      status,
      current_period_end: new Date(currentPeriodEnd * 1000).toISOString(),
    })

    if (orgId) {
      // Update org plan + store stripe_customer_id
      await supabase
        .from('organizations')
        .update({ plan: tier, stripe_customer_id: customerId })
        .eq('id', orgId)
    }

    logger.info(
      `[subscription-handler] subscription.created: ${subscriptionId} org=${orgId} plan=${tier}`,
    )
  } else if (eventAction === 'updated') {
    const orgId = await resolveOrgId(supabase, subscriptionId, metadata)
    const tier = resolveTierFromPrice(priceId, metadata.tier)

    await supabase
      .from('subscriptions')
      .update({
        plan: tier,
        status,
        current_period_end: new Date(currentPeriodEnd * 1000).toISOString(),
      })
      .eq('stripe_subscription_id', subscriptionId)

    if (orgId) {
      await supabase
        .from('organizations')
        .update({ plan: tier })
        .eq('id', orgId)
    }

    logger.info(
      `[subscription-handler] subscription.updated: ${subscriptionId} plan=${tier} status=${status}`,
    )
  } else if (eventAction === 'deleted') {
    const orgId = await resolveOrgId(supabase, subscriptionId, metadata)

    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', subscriptionId)

    if (orgId) {
      await supabase
        .from('organizations')
        .update({ plan: 'free' })
        .eq('id', orgId)
    }

    logger.info(
      `[subscription-handler] subscription.deleted: ${subscriptionId} org=${orgId} -> free`,
    )
  }
}

// ---------------------------------------------------------------------------
// Checkout completion handler
// ---------------------------------------------------------------------------

/**
 * Handle checkout.session.completed events.
 * Creates/updates subscription row and org with customer ID.
 */
export async function handleCheckoutComplete(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const session = event.data.object as unknown as Record<string, unknown>
  const subscriptionId = session.subscription as string
  const customerId = session.customer as string
  const metadata = (session.metadata ?? {}) as Record<string, string>
  const orgId = metadata.org_id
  const tier = metadata.tier ?? 'starter'

  if (!orgId) {
    logger.warn(
      '[subscription-handler] checkout.session.completed missing org_id in metadata',
    )
    return
  }

  await supabase.from('subscriptions').upsert({
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    org_id: orgId,
    plan: tier,
    status: 'active',
  })

  // Update org plan + store customer ID
  await supabase
    .from('organizations')
    .update({ plan: tier, stripe_customer_id: customerId })
    .eq('id', orgId)

  logger.info(
    `[subscription-handler] checkout.completed: org=${orgId} sub=${subscriptionId} plan=${tier}`,
  )
}

// ---------------------------------------------------------------------------
// Trial ending handler (BILL-07)
// ---------------------------------------------------------------------------

/**
 * Handle customer.subscription.trial_will_end events.
 * Sends email notification 3 days before trial expires.
 * Marks subscription metadata with trial_end_notified to prevent duplicate emails.
 */
export async function handleTrialEnding(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const sub = event.data.object as unknown as Record<string, unknown>
  const subscriptionId = sub.id as string
  const metadata = (sub.metadata ?? {}) as Record<string, string>
  const orgId = metadata.org_id

  if (!orgId) {
    // Try resolving from DB
    const resolved = await resolveOrgId(supabase, subscriptionId, metadata)
    if (!resolved) {
      logger.warn(
        `[subscription-handler] trial_will_end: no org_id found for ${subscriptionId}`,
      )
      return
    }
  }

  const resolvedOrgId = orgId || (await resolveOrgId(supabase, subscriptionId, metadata))
  if (!resolvedOrgId) return

  // Check if notification already sent (prevent duplicates)
  if (metadata.trial_end_notified === 'true') {
    logger.info(
      `[subscription-handler] trial_will_end: already notified for ${subscriptionId}`,
    )
    return
  }

  // Look up organization name and billing email
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('name, metadata')
    .eq('id', resolvedOrgId)
    .single()

  if (orgError || !org) {
    logger.warn(
      `[subscription-handler] trial_will_end: could not find org ${resolvedOrgId}`,
    )
    return
  }

  const orgName = (org as Record<string, unknown>).name as string
  const orgMeta = (org as Record<string, unknown>).metadata as Record<string, unknown> | null

  // Try billing_email from org metadata, then fall back to profile email
  let billingEmail: string | null = null
  if (orgMeta && typeof orgMeta === 'object' && orgMeta.billing_email) {
    billingEmail = orgMeta.billing_email as string
  }

  if (!billingEmail) {
    // Look up owner's email from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('org_id', resolvedOrgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    billingEmail = (profile?.email as string) ?? null
  }

  if (!billingEmail) {
    logger.warn(
      `[subscription-handler] trial_will_end: no billing email for org ${resolvedOrgId}, skipping`,
    )
    return
  }

  // Send trial expiry notification email
  let settingsUrl: string
  try {
    settingsUrl = `${getAppUrl()}/dashboard/settings`
  } catch {
    settingsUrl = 'https://app.bitbit.chat/dashboard/settings'
  }

  const subject = 'Your BitBit trial ends in 3 days'
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #1a1a1a; margin-bottom: 20px;">Your trial is ending soon</h2>
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Hi there! Your 30-day free trial for <strong>${orgName}</strong> ends in 3 days.
      </p>
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        To keep using all your AI-powered features, subscribe to a plan before your trial expires.
        If you don't subscribe, your account will be downgraded to the free tier.
      </p>
      <p style="margin-bottom: 20px;">
        <a href="${settingsUrl}" style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500;">
          Manage Billing
        </a>
      </p>
      <p style="color: #666; font-size: 14px; margin: 0;">
        If you have any questions about our plans, reply to this email and we'll help you out.
      </p>
    </div>
  `

  try {
    await sendCommandReplyEmail(billingEmail, subject, htmlBody)
    logger.info(
      `[subscription-handler] trial_will_end: sent notification to ${billingEmail} for org ${resolvedOrgId}`,
    )
  } catch (err) {
    logger.warn(
      `[subscription-handler] trial_will_end: failed to send email to ${billingEmail}:`,
      err,
    )
    return
  }

  // Mark notification sent via Stripe subscription metadata to prevent duplicates
  try {
    await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        ...metadata,
        trial_end_notified: 'true',
      },
    })
  } catch (err) {
    // Non-critical -- email was still sent
    logger.warn(
      `[subscription-handler] trial_will_end: failed to update Stripe metadata:`,
      err,
    )
  }
}

// ---------------------------------------------------------------------------
// Invoice paid handler
// ---------------------------------------------------------------------------

/**
 * Handle invoice.paid events.
 * Resets dunning state and updates invoice status.
 */
export async function handleInvoicePaid(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as unknown as Record<string, unknown>
  const metadata = (invoice.metadata ?? {}) as Record<string, string>
  const orgId = metadata.org_id
  const invoiceId = invoice.id as string

  logger.info(`[subscription-handler] invoice.paid: ${invoiceId}`)

  if (orgId) {
    await updateInvoiceStatus(supabase, orgId, invoiceId, 'paid')
    await resetDunningState(supabase, orgId)
  }
}

// ---------------------------------------------------------------------------
// Payment failed handler
// ---------------------------------------------------------------------------

/**
 * Handle invoice.payment_failed events.
 * Triggers dunning flow and updates invoice status.
 */
export async function handlePaymentFailed(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as unknown as Record<string, unknown>
  const metadata = (invoice.metadata ?? {}) as Record<string, string>
  const orgId = metadata.org_id
  const invoiceId = invoice.id as string

  logger.error(`[subscription-handler] payment_failed: ${invoiceId}`)

  if (orgId) {
    await updateInvoiceStatus(supabase, orgId, invoiceId, 'failed')
    const lastError =
      ((invoice.last_payment_error as Record<string, unknown>)?.message as string) ??
      'Payment failed'
    await triggerDunning(supabase, orgId, invoiceId, lastError)
  }
}
