import { withCronGuard } from '@/lib/cron/cron-guard'
import { computeEntityProfile } from '@/lib/context/entity-profile-builder'
import {
  extractPaymentPattern,
  extractResponseLatency,
  extractActivityFrequency,
  extractChannelPreference,
  upsertPattern,
} from '@/lib/context/pattern-extractor'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Find stale profiles (valid_until < now)
    const { data: stale, error: queryError } = await supabase
      .from('entity_profiles')
      .select('org_id, entity_type, entity_id')
      .lt('valid_until', new Date().toISOString())
      .limit(50)

    if (queryError) {
      throw new Error(`Failed to query stale profiles: ${queryError.message}`)
    }

    let refreshed = 0
    const errors: string[] = []

    for (const profile of stale ?? []) {
      try {
        await computeEntityProfile(supabase, {
          orgId: profile.org_id,
          entityType: profile.entity_type,
          entityId: profile.entity_id,
        })

        // Extract behavioral patterns alongside profile refresh
        const extractors = [
          extractPaymentPattern,
          extractResponseLatency,
          extractActivityFrequency,
          extractChannelPreference,
        ]
        for (const extract of extractors) {
          const pattern = await extract(supabase, profile.org_id, profile.entity_id)
          if (pattern) {
            await upsertPattern(supabase, profile.org_id, profile.entity_type, profile.entity_id, pattern)
          }
        }

        refreshed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(
          `[cron/entity-profile-refresh] Failed to refresh profile entity=${profile.entity_id}: ${msg}`,
        )
        errors.push(profile.entity_id)
      }
    }

    const total = (stale ?? []).length
    return {
      message: `Refreshed ${refreshed}/${total} stale profiles`,
      details: {
        total,
        refreshed,
        failed: errors.length,
        failedEntityIds: errors,
      },
    }
  })
}
