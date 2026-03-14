import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBackfillJob, runBackfill, getBackfillStatus } from '@/lib/rag/backfill-service'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/rag/backfill
 * Trigger a new backfill job or run an existing pending job.
 *
 * Body: { orgId: string, channelType: string, backfillDays?: number }
 * Returns: { jobId: string, status: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { orgId, channelType, backfillDays = 90 } = body

    if (!orgId || !channelType) {
      return NextResponse.json(
        { error: 'orgId and channelType required' },
        { status: 400 }
      )
    }

    if (typeof backfillDays !== 'number' || backfillDays < 1) {
      return NextResponse.json(
        { error: 'backfillDays must be a positive number' },
        { status: 400 }
      )
    }

    const jobId = await createBackfillJob(supabase, orgId, channelType, backfillDays)

    // Run backfill asynchronously (don't await, just fire and forget)
    runBackfill(supabase, jobId).catch(err => {
      logger.error('[backfill-api] Background job failed:', err)
    })

    logger.info('[backfill-api] Job created and started', {
      jobId,
      orgId,
      channelType,
      backfillDays,
    })

    return NextResponse.json({ jobId, status: 'started' })
  } catch (err) {
    logger.error('[backfill-api] POST error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/rag/backfill?jobId=<jobId>
 * Get the status of a backfill job.
 *
 * Query params: { jobId: string }
 * Returns: BackfillJob object with current status and progress
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId query parameter required' },
        { status: 400 }
      )
    }

    const status = await getBackfillStatus(supabase, jobId)
    if (!status) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json(status)
  } catch (err) {
    logger.error('[backfill-api] GET error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
