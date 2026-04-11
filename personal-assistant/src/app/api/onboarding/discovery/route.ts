import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runFirstRunDiscovery } from '@/lib/onboarding/first-run-discovery'
import { logger } from '@/lib/core/logger'

export const maxDuration = 120 // 2 minutes timeout
export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/discovery
 *
 * Triggers the lightweight first-run discovery scan:
 * 1. Scans last 30 days of connected channels (fast -- no Opus)
 * 2. Extracts user identity, top contacts, active threads
 * 3. Stores result in profile preferences for the welcome conversation
 * 4. Fires full Opus synthesis in the background (fire-and-forget)
 *
 * Returns: FirstRunDiscoveryResult
 */
export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No org found' }, { status: 400 })
  }

  logger.info('[api/onboarding/discovery] Starting first-run discovery', {
    userId: user.id,
    orgId: profile.org_id,
  })

  try {
    const result = await runFirstRunDiscovery(
      supabase,
      profile.org_id,
      user.id,
    )

    logger.info('[api/onboarding/discovery] Discovery complete', {
      userId: user.id,
      orgId: profile.org_id,
      totalMessages: result.stats.totalMessages,
      contacts: result.topContacts.length,
      threads: result.activeThreads.length,
      durationMs: result.stats.scanDurationMs,
    })

    // Fire full Opus synthesis in the background (fire-and-forget)
    // This runs the expensive LLM-based world model synthesis after the user proceeds
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        || process.env.VERCEL_URL
        || 'http://localhost:3000'
      const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

      void fetch(`${url}/api/onboarding/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward auth cookie for the background request
          Cookie: '', // Server-side -- no cookie forwarding needed, auth is session-based
        },
      }).catch(err => {
        logger.warn('[api/onboarding/discovery] Background synthesis fire-and-forget failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    } catch {
      // Background synthesis failure is non-blocking
    }

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/onboarding/discovery] Failed', {
      userId: user.id,
      orgId: profile.org_id,
      error,
    })
    return NextResponse.json({ error }, { status: 500 })
  }
}
