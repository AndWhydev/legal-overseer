import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Structured result returned by cron handler functions.
 */
export type CronResult = {
  message: string
  details?: Record<string, unknown>
}

/** Shared maxDuration for all cron routes (5 minutes). */
export const cronMaxDuration = 300

/** Shared dynamic export for all cron routes. */
export const cronDynamic = 'force-dynamic' as const

/**
 * Shared cron endpoint guard and execution wrapper.
 *
 * Provides:
 * - Authorization via Bearer token (CRON_SECRET)
 * - Service-role Supabase client (no user session needed)
 * - Structured JSON response with timing
 * - Error handling and logging
 */
export async function withCronGuard(
  request: Request,
  handler: (supabase: SupabaseClient) => Promise<CronResult>,
): Promise<NextResponse> {
  // Extract cron name from URL path for logging
  const url = new URL(request.url)
  const cronName = url.pathname.replace('/api/cron/', '') || 'unknown'
  const tag = `[cron/${cronName}]`

  // Validate authorization
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    console.warn(`${tag} Unauthorized request rejected`)
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Create service-role Supabase client (not cookie-based -- cron has no user session)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error(`${tag} Missing SUPABASE_URL or SERVICE_ROLE_KEY`)
    return NextResponse.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const startTime = Date.now()
  console.log(`${tag} Starting execution`)

  try {
    const result = await handler(supabase)
    const durationMs = Date.now() - startTime

    console.log(`${tag} Completed in ${durationMs}ms: ${result.message}`)

    return NextResponse.json({
      success: true,
      duration_ms: durationMs,
      result,
    })
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    console.error(`${tag} Failed after ${durationMs}ms:`, err)

    return NextResponse.json(
      {
        success: false,
        duration_ms: durationMs,
        error: errorMessage,
      },
      { status: 500 },
    )
  }
}
