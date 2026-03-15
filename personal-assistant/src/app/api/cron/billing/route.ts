import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronGuard, cronDynamic, cronMaxDuration, type CronResult } from '@/lib/cron/cron-guard'
import { processDunningSequence } from '@/lib/billing/dunning'

export const dynamic = cronDynamic
export const maxDuration = cronMaxDuration

/**
 * Cron handler for billing operations
 * - Process dunning sequence for past_due subscriptions
 * - Execute payment recovery emails and downgrades
 *
 * Triggered hourly or manually via:
 * curl -H "Authorization: Bearer ${CRON_SECRET}" https://app.bitbit.chat/api/cron/billing
 */
async function handler(supabase: SupabaseClient): Promise<CronResult> {
  const startTime = Date.now()

  // Process dunning sequence
  await processDunningSequence(supabase)

  const durationMs = Date.now() - startTime

  return {
    message: 'Billing cron completed successfully',
    details: {
      dunning_processed: true,
      duration_ms: durationMs,
    },
  }
}

export async function GET(request: NextRequest) {
  return withCronGuard(request, handler)
}
