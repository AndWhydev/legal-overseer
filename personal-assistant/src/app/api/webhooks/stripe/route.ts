import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyStripeWebhook } from '@/lib/channels/stripe'
import { logger } from '@/lib/core/logger';

/**
 * Stripe webhook endpoint.
 *
 * Handles payment events: payment_intent.succeeded, payment_intent.payment_failed,
 * invoice.paid, invoice.payment_failed, etc.
 *
 * Stripe signs every webhook with the endpoint's signing secret.
 */
/**
 * Initialize Supabase client for webhook handler
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

/**
 * Update invoice status and create timeline event
 */
async function updateInvoiceStatus(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  stripePaymentLinkOrId: string,
  newStatus: 'paid' | 'failed' | 'overdue',
) {
  try {
    // Find invoice by stripe_payment_link or look for match in metadata
    const { data: invoice, error: findError } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('org_id', orgId)
      .or(`stripe_payment_link.eq.${stripePaymentLinkOrId}`)
      .single() as { data: { id: string; invoice_number: string } | null; error: { message: string } | null }

    if (findError || !invoice) {
      logger.warn(
        '[webhook/stripe] Could not find invoice for Stripe ID:',
        stripePaymentLinkOrId,
        findError?.message,
      )
      return
    }

    // Update invoice status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('invoices')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'paid' && { paid_date: new Date().toISOString().split('T')[0] }),
      })
      .eq('id', invoice.id)

    if (updateError) {
      logger.error('[webhook/stripe] Failed to update invoice:', updateError.message)
      return
    }

    // Create timeline event
    const eventType = newStatus === 'paid' ? 'invoice_paid' : 'invoice_failed'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: timelineError } = await (supabase as any).from('entity_timeline').insert({
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
      logger.warn('[webhook/stripe] Failed to create timeline event:', timelineError.message)
    } else {
      logger.info(`[webhook/stripe] Updated invoice ${invoice.invoice_number} to status: ${newStatus}`)
    }
  } catch (err) {
    logger.error('[webhook/stripe] Error updating invoice:', err)
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  try {
    const rawBody = await request.text()
    const event = await verifyStripeWebhook(rawBody, signature, webhookSecret)

    if ('error' in event) {
      logger.error('[webhook/stripe] Verification failed:', event.error)
      return NextResponse.json({ error: event.error }, { status: 400 })
    }

    logger.info('[webhook/stripe] Event:', event.type, event.id)

    // For database operations, we need orgId from somewhere
    // In a real scenario, this would be passed in metadata or we'd look it up
    const supabase = getSupabaseClient()

    // Dispatch based on event type
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const obj = event.data.object as Record<string, unknown>
        logger.info('[webhook/stripe] Payment succeeded:', obj.id, obj.amount, obj.currency)
        // In production: extract orgId from metadata and update invoice
        // For now, log the event
        break
      }
      case 'payment_intent.payment_failed': {
        const obj = event.data.object as Record<string, unknown>
        logger.error('[webhook/stripe] Payment failed:', obj.id)
        // In production: extract orgId from metadata and update invoice to 'failed'
        break
      }
      case 'invoice.paid': {
        const obj = event.data.object as Record<string, unknown>
        logger.info('[webhook/stripe] Invoice paid:', obj.id)
        // Update invoice status to 'paid' if we can determine the orgId
        // This would typically come from invoice metadata
        const invoiceId = obj.id as string
        // TODO: extract orgId from invoice metadata or look it up
        // await updateInvoiceStatus(supabase, orgId, invoiceId, 'paid')
        break
      }
      case 'invoice.payment_failed': {
        const obj = event.data.object as Record<string, unknown>
        logger.error('[webhook/stripe] Invoice payment failed:', obj.id)
        // Update invoice status to 'failed' if we can determine the orgId
        const invoiceId = obj.id as string
        // TODO: extract orgId from invoice metadata or look it up
        // await updateInvoiceStatus(supabase, orgId, invoiceId, 'failed')
        break
      }
      default:
        logger.info('[webhook/stripe] Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true, type: event.type })
  } catch (err) {
    logger.error('[webhook/stripe] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}
