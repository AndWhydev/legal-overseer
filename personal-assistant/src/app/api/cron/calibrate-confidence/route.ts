import { withCronGuard } from '@/lib/cron/cron-guard'
import {
  calibrateThresholds,
  storeCalibratedThresholds,
} from '@/lib/intelligence/confidence-calibrator'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Daily cron: recalibrate confidence thresholds for all orgs/agent types.
 * Schedule: 2am AEST daily (16:00 UTC previous day)
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Fetch all organisations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organisations: ${orgError.message}`)
    }

    if (!orgs || orgs.length === 0) {
      return { message: 'No organisations to process', details: { results: [] } }
    }

    let totalCalibrated = 0
    let totalSkipped = 0
    const results: Record<string, unknown>[] = []

    for (const org of orgs) {
      const orgId = org.id
      try {
        // Get all enabled agent configs for this org
        const { data: configs, error: configError } = await supabase
          .from('agent_configs')
          .select('agent_type')
          .eq('org_id', orgId)
          .eq('enabled', true)

        if (configError || !configs || configs.length === 0) {
          continue
        }

        // Get unique agent types
        const agentTypes = [...new Set(configs.map(c => c.agent_type))]

        for (const agentType of agentTypes) {
          try {
            const calibrated = await calibrateThresholds(supabase, orgId, agentType)

            if (calibrated) {
              await storeCalibratedThresholds(supabase, orgId, agentType, calibrated)
              totalCalibrated++
              logger.info(
                `[cron/calibrate-confidence] Calibrated ${agentType} for org ${orgId}: ` +
                `act=${calibrated.act.toFixed(2)} ask=${calibrated.ask.toFixed(2)} ` +
                `samples=${calibrated.sampleSize}`,
              )
            } else {
              totalSkipped++
            }
          } catch (agentErr) {
            logger.warn(
              `[cron/calibrate-confidence] Failed to calibrate ${agentType} for org ${orgId}:`,
              agentErr,
            )
            totalSkipped++
          }
        }

        results.push({
          orgId,
          agentTypes: agentTypes.length,
        })
      } catch (orgErr) {
        logger.error(
          `[cron/calibrate-confidence] Failed processing org ${orgId}:`,
          orgErr,
        )
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Calibration complete: ${totalCalibrated} calibrated, ${totalSkipped} skipped (insufficient data)`,
      details: {
        orgsProcessed: orgs.length,
        calibrated: totalCalibrated,
        skipped: totalSkipped,
        results,
      },
    }
  })
}
