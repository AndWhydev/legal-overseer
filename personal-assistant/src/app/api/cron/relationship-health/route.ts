import { withCronGuard } from '@/lib/cron/cron-guard'
import {
  computeAllRelationshipScores,
  generateRelationshipNudges,
} from '@/lib/intelligence/relationship-scorer'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Daily cron (3am AEST) — scores all contact relationships and generates nudges.
 *
 * For each org:
 *  1. computeAllRelationshipScores — updates contacts.relationship_strength
 *  2. generateRelationshipNudges — creates approval_queue entries for cold contacts
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

    const results: Record<string, unknown>[] = []
    let totalScored = 0
    let totalNudges = 0

    for (const org of orgs ?? []) {
      const orgId = org.id

      try {
        // Step 1: Score all relationships
        const scoreResult = await computeAllRelationshipScores(supabase, orgId)
        totalScored += scoreResult.scored

        // Step 2: Generate nudges for cold relationships
        const nudgeResult = await generateRelationshipNudges(supabase, orgId)
        totalNudges += nudgeResult.nudgesCreated

        results.push({
          orgId,
          scored: scoreResult.scored,
          scoreErrors: scoreResult.errors,
          nudgesCreated: nudgeResult.nudgesCreated,
        })
      } catch (orgErr) {
        logger.error('[cron/relationship-health] Failed processing org', {
          orgId,
          error: orgErr instanceof Error ? orgErr.message : String(orgErr),
        })
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Relationship health scored ${totalScored} contacts, generated ${totalNudges} nudges across ${(orgs ?? []).length} orgs`,
      details: { results, totalScored, totalNudges },
    }
  })
}
