import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/billing/stripe-client'
import {
  handleSubscriptionLifecycle,
  handleCheckoutComplete,
  handleTrialEnding,
  handleInvoicePaid,
  handlePaymentFailed,
  logWebhookEvent,
} from '@/lib/billing/subscription-handler'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Service role Supabase client (webhook has no user auth context)
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

async function isDuplicate(
  supabase: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('external_event_id', eventId)
    .eq('status', 'success')
    .maybeSingle()

  return data !== null
}

// ---------------------------------------------------------------------------
// Consolidated Stripe webhook handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const body = await req.text()

  // Verify signature using Stripe SDK (replaces hand-rolled verifyStripeWebhook)
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    logger.error('[billing/webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Service role client for all DB operations
  let supabase
  try {
    supabase = getServiceClient()
  } catch (err) {
    logger.error('[billing/webhook] Failed to create DB client:', err)
    return NextResponse.json({ received: true, error: 'db_init_failed' })
  }

  // Idempotency: skip if already processed successfully
  try {
    if (await isDuplicate(supabase, event.id)) {
      logger.info(`[billing/webhook] Duplicate event ${event.id}, skipping`)
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch (err) {
    // Non-fatal: continue processing if idempotency check fails
    logger.warn('[billing/webhook] Idempotency check failed:', err)
  }

  // Record processing attempt
  await logWebhookEvent(
    supabase,
    'stripe',
    event.type,
    event.id,
    event.data.object as unknown as Record<string, unknown>,
    'processing',
  )

  try {
    // Dispatch by event type
    switch (event.type) {
      // Subscription lifecycle
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionLifecycle(supabase, event)
        break

      // Trial warning
      case 'customer.subscription.trial_will_end':
        await handleTrialEnding(supabase, event)
        break

      // Checkout
      case 'checkout.session.completed':
        await handleCheckoutComplete(supabase, event)
        break

      // Invoice events
      case 'invoice.paid':
        await handleInvoicePaid(supabase, event)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event)
        break

      // Payment intent events (legacy support)
      case 'payment_intent.succeeded':
        await handleInvoicePaid(supabase, event)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(supabase, event)
        break

      default:
        logger.info(`[billing/webhook] Unhandled event type: ${event.type}`)
    }

    // Mark event as successfully processed
    await logWebhookEvent(
      supabase,
      'stripe',
      event.type,
      event.id,
      event.data.object as unknown as Record<string, unknown>,
      'success',
      200,
    )

    logger.info(`[billing/webhook] Processed ${event.type} (${event.id})`)
  } catch (err) {
    // Log error but ALWAYS return 200 to Stripe to prevent retry storms
    logger.error(`[billing/webhook] Handler error for ${event.type}:`, err)

    await logWebhookEvent(
      supabase,
      'stripe',
      event.type,
      event.id,
      event.data.object as unknown as Record<string, unknown>,
      'failed',
      200,
      err instanceof Error ? err.message : 'Unknown error',
    )
  }

  // ALWAYS return 200 to Stripe
  return NextResponse.json({ received: true, type: event.type })
}
