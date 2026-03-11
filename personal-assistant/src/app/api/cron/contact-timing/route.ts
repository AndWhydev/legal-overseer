import { withCronGuard } from '@/lib/cron/cron-guard'
import { computeAllContactTimings } from '@/lib/intelligence/contact-timing'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Weekly cron: compute optimal contact timing for all orgs.
 *
 * Schedule: Sunday midnight AEST (Saturday 14:00 UTC).
 * Analyzes entity_timeline message pairs to find when contacts
 * are most responsive, stores results in entity_patterns + contacts.
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    let totalProcessed = 0
    let totalSkipped = 0
    let totalErrors = 0
    const orgResults: Record<string, unknown>[] = []

    for (const org of orgs ?? []) {
      try {
        const result = await computeAllContactTimings(supabase, org.id)
        totalProcessed += result.processed
        totalSkipped += result.skipped
        totalErrors += result.errors

        orgResults.push({
          orgId: org.id,
          processed: result.processed,
          skipped: result.skipped,
          errors: result.errors,
        })
      } catch (err) {
        logger.error('[cron/contact-timing] Failed for org', {
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        })
        totalErrors++
        orgResults.push({
          orgId: org.id,
          error: err instanceof Error ? err.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Contact timing computed for ${orgs?.length ?? 0} orgs: ${totalProcessed} contacts processed, ${totalSkipped} skipped, ${totalErrors} errors`,
      details: {
        orgs: orgs?.length ?? 0,
        totalProcessed,
        totalSkipped,
        totalErrors,
        orgResults,
      },
    }
  })
}
