import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runOnboardingPipeline } from '@/lib/onboarding/onboarding-pipeline'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300 // 5 minutes for full synthesis
export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/synthesize
 *
 * Triggers the onboarding intelligence pipeline:
 * 1. Crawls all connected channels (Gmail, Outlook, WhatsApp, SMS, Calendar)
 * 2. Feeds corpus to Opus for world model synthesis
 * 3. Populates contacts, knowledge graph, and semantic memories
 *
 * Returns the complete world model for verification UI.
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

  logger.info('[api/onboarding/synthesize] Starting pipeline', {
    userId: user.id,
    orgId: profile.org_id,
  })

  try {
    const events = runOnboardingPipeline(supabase, profile.org_id, user.id)

    let finalResult = null

    for await (const event of events) {
      if (event.phase === 'complete') {
        finalResult = event.summary
      } else if (event.phase === 'error') {
        return NextResponse.json({ error: event.error }, { status: 500 })
      }
    }

    if (!finalResult) {
      return NextResponse.json({ error: 'Pipeline produced no result' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      result: {
        crawl: finalResult.crawl,
        synthesis: finalResult.synthesis,
        ingestion: finalResult.ingestion,
        totalDurationMs: finalResult.totalDurationMs,
        // Include the world model for the verification UI
        worldModel: {
          user: finalResult.worldModel.user,
          people: finalResult.worldModel.people,
          projects: finalResult.worldModel.projects,
          financials: finalResult.worldModel.financials,
          commitments: finalResult.worldModel.commitments,
          websitesAndDomains: finalResult.worldModel.websitesAndDomains,
          communicationPatterns: finalResult.worldModel.communicationPatterns,
          // Don't send raw markdown to frontend (too large)
        },
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[api/onboarding/synthesize] Failed', { error })
    return NextResponse.json({ error }, { status: 500 })
  }
}
