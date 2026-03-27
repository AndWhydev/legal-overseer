import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/billing/checkout'
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

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tier = body.tier as string
  let orgId = body.orgId as string | undefined

  if (!tier) {
    return NextResponse.json({ error: 'Missing tier' }, { status: 400 })
  }

  // Resolve orgId from user profile if not provided in body
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

  if (!['starter', 'growth', 'scale'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  try {
    const origin = req.nextUrl.origin
    const result = await createCheckoutSession(client, {
      orgId,
      tier: tier as 'starter' | 'growth' | 'scale',
      successUrl: `${origin}/dashboard?checkout=success`,
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

// GET redirect for pricing page links
export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get('tier')
  if (!tier) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  // Redirect to login with checkout intent
  return NextResponse.redirect(
    new URL(`/login?redirect=/dashboard&checkout_tier=${tier}`, req.url),
  )
}
