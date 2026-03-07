import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { verifyStripeWebhook } from '@/lib/channels/stripe'
import {
  parseSubscriptionEvent,
  handleSubscriptionEvent,
} from '@/lib/billing/checkout'

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const body = await req.text()

  const eventOrError = await verifyStripeWebhook(body, signature, webhookSecret)
  if ('error' in eventOrError) {
    console.error('[billing/webhook] verification failed:', eventOrError.error)
    return NextResponse.json({ error: eventOrError.error }, { status: 400 })
  }

  const event = eventOrError

  // Only handle subscription events
  const subEvent = parseSubscriptionEvent(
    event.type,
    event.data.object,
  )

  if (!subEvent) {
    // Acknowledge but ignore non-subscription events
    return NextResponse.json({ received: true })
  }

  try {
    const client = await createClient()
    if (!client) {
      return NextResponse.json({ error: 'DB client failed' }, { status: 500 })
    }

    await handleSubscriptionEvent(client, subEvent)

    console.log(
      `[billing/webhook] processed ${subEvent.type} for subscription ${subEvent.subscriptionId}`,
    )

    return NextResponse.json({ received: true, type: subEvent.type })
  } catch (err) {
    // Always return 200 to Stripe to prevent retry storms — log and handle internally
    console.error('[billing/webhook] handler error:', err)
    return NextResponse.json({ received: true, error: 'handler_failed' })
  }
}
