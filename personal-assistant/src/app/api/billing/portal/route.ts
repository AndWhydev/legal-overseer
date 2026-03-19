import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/billing/stripe-client'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session and returns the URL.
 * User must be authenticated with a valid Stripe customer ID.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }

  const orgId = profile.org_id as string

  // Look up stripe_customer_id from organizations table (added in 21-01 migration)
  let stripeCustomerId: string | null = null

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single()

  stripeCustomerId = (org?.stripe_customer_id as string) ?? null

  // Fallback: look up from subscriptions table
  if (!stripeCustomerId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    stripeCustomerId = (sub?.stripe_customer_id as string) ?? null
  }

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe to a plan first.' },
      { status: 404 },
    )
  }

  try {
    const origin = req.nextUrl.origin
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/dashboard/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    logger.error('[billing/portal] Failed to create portal session:', err)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 },
    )
  }
}
