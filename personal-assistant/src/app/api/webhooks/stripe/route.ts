import { NextRequest, NextResponse } from 'next/server'
import { verifyStripeWebhook } from '@/lib/channels/stripe'

/**
 * Stripe webhook endpoint.
 *
 * Handles payment events: payment_intent.succeeded, payment_intent.payment_failed,
 * invoice.paid, invoice.payment_failed, etc.
 *
 * Stripe signs every webhook with the endpoint's signing secret.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  try {
    const rawBody = await request.text()
    const event = await verifyStripeWebhook(rawBody, signature, webhookSecret)

    if ('error' in event) {
      console.error('[webhook/stripe] Verification failed:', event.error)
      return NextResponse.json({ error: event.error }, { status: 400 })
    }

    console.log('[webhook/stripe] Event:', event.type, event.id)

    // Dispatch based on event type
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const obj = event.data.object
        console.log('[webhook/stripe] Payment succeeded:', obj.id, obj.amount, obj.currency)
        break
      }
      case 'payment_intent.payment_failed': {
        const obj = event.data.object
        console.error('[webhook/stripe] Payment failed:', obj.id)
        break
      }
      case 'invoice.paid': {
        const obj = event.data.object
        console.log('[webhook/stripe] Invoice paid:', obj.id)
        break
      }
      case 'invoice.payment_failed': {
        const obj = event.data.object
        console.error('[webhook/stripe] Invoice payment failed:', obj.id)
        break
      }
      default:
        console.log('[webhook/stripe] Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true, type: event.type })
  } catch (err) {
    console.error('[webhook/stripe] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}
