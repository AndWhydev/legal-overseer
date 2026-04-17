import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { createCheckoutSession, isPaidTier } from '@/lib/billing/checkout'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { logger } from '@/lib/core/logger';

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimited = checkUserEndpointLimit(user.id, '/api/billing/checkout')
  if (rateLimited) return rateLimited

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tier = body.tier
  let orgId = body.orgId as string | undefined

  if (!isPaidTier(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  if (!orgId) {
    const { data: profile } = await client
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    orgId = (profile?.org_id as string) ?? undefined
  }

  if (!orgId) {
    return NextResponse.json({ error: 'No organisation found for user' }, { status: 404 })
  }

  try {
    const origin = req.nextUrl.origin
    const result = await createCheckoutSession(client, {
      orgId,
      tier,
      successUrl: `${origin}/onboard?checkout=success`,
      cancelUrl: `${origin}/pricing?checkout=cancelled`,
      customerEmail: user.email,
    })

    return NextResponse.json(result)
  } catch (err) {
    logger.error('[billing/checkout] error:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: String(err) },
      { status: 500 },
    )
  }
}

/**
 * Unauthed pricing-page tier links land here via GET; forward to /signup so
 * the auto-checkout handoff resumes once the account exists.
 */
export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get('tier')
  if (!tier) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }
  return NextResponse.redirect(new URL(`/signup?tier=${tier}`, req.url))
}
