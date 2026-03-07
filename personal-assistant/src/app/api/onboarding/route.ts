import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { runBetaOnboarding } from '@/lib/onboarding/beta-flow'
import { createOrg, setupChannels } from '@/lib/onboarding/multi-tenant'
import { logger } from '@/lib/core/logger';

// POST /api/onboarding — create org (self-serve or beta)
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create database client' }, { status: 500 })
  }

  // Verify authenticated
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string | undefined

  try {
    if (action === 'beta') {
      // Beta onboarding (AWU seed)
      const orgName = body.orgName as string
      const adminEmail = body.adminEmail as string
      const adminName = body.adminName as string

      if (!orgName || !adminEmail || !adminName) {
        return NextResponse.json(
          { error: 'Missing required fields: orgName, adminEmail, adminName' },
          { status: 400 },
        )
      }

      const result = await runBetaOnboarding(client, {
        orgName,
        adminEmail,
        adminName,
        channels: body.channels as Parameters<typeof runBetaOnboarding>[1]['channels'],
      })

      return NextResponse.json(result, { status: 201 })
    }

    if (action === 'setup-channels') {
      // Add channels to existing org
      const orgId = body.orgId as string
      const channels = body.channels as Parameters<typeof setupChannels>[1]['channels']

      if (!orgId || !channels || !Array.isArray(channels)) {
        return NextResponse.json(
          { error: 'Missing required fields: orgId, channels[]' },
          { status: 400 },
        )
      }

      const result = await setupChannels(client, { orgId, channels })
      return NextResponse.json(result)
    }

    // Default: self-serve org creation
    const name = body.name as string
    const plan = body.plan as string

    if (!name || !plan) {
      return NextResponse.json(
        { error: 'Missing required fields: name, plan' },
        { status: 400 },
      )
    }

    const result = await createOrg(client, {
      name,
      ownerEmail: user.email ?? '',
      ownerName: (body.ownerName as string) ?? user.email ?? '',
      plan: plan as 'starter' | 'growth' | 'scale' | 'enterprise',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    logger.error('[onboarding] error:', err)
    return NextResponse.json(
      { error: 'Onboarding failed', details: String(err) },
      { status: 500 },
    )
  }
}
