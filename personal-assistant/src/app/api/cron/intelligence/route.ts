import { withCronGuard } from '@/lib/cron/cron-guard'
import {
  analyzeRevenueOpportunities,
  computeClientHealth,
  projectCashFlow,
  assessCapacity,
} from '@/lib/intelligence'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Intelligence Layer cron route.
 * Schedule: Every 6 hours (see vercel.json)
 *
 * Recomputes all cross-role intelligence metrics for all orgs:
 * - Revenue Radar (24h cache, daily recompute)
 * - Client Health (24h cache, daily recompute)
 * - Cash Flow Prophet (12h cache, frequent recompute)
 * - Capacity Oracle (6h cache, frequent recompute)
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results: Array<{
      orgId: string
      revenueRadar: number
      clientHealth: number
      cashFlow: boolean
      capacity: string
      errors: string[]
    }> = []

    let totalOpportunities = 0
    let totalClientsScored = 0
    let totalAlerts = 0

    for (const org of orgs ?? []) {
      const errors: string[] = []
      let revenueCount = 0
      let healthCount = 0
      let cashFlowOk = false
      let capacityStatus = 'unknown'

      // Revenue Radar
      try {
        const radar = await analyzeRevenueOpportunities(supabase, org.id)
        revenueCount = radar.opportunities.length
        totalOpportunities += revenueCount
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`revenue-radar: ${msg}`)
        logger.error('[cron/intelligence] Revenue Radar failed', { orgId: org.id, error: msg })
      }

      // Client Health
      try {
        const health = await computeClientHealth(supabase, org.id)
        healthCount = health.clientsScored
        totalClientsScored += healthCount
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`client-health: ${msg}`)
        logger.error('[cron/intelligence] Client Health failed', { orgId: org.id, error: msg })
      }

      // Cash Flow Prophet
      try {
        const cashFlow = await projectCashFlow(supabase, org.id, 3)
        cashFlowOk = !cashFlow.gatheringData
        totalAlerts += cashFlow.alerts.length
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`cash-flow-prophet: ${msg}`)
        logger.error('[cron/intelligence] Cash Flow Prophet failed', { orgId: org.id, error: msg })
      }

      // Capacity Oracle
      try {
        const capacity = await assessCapacity(supabase, org.id)
        capacityStatus = capacity.status
        totalAlerts += capacity.alerts.length
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`capacity-oracle: ${msg}`)
        logger.error('[cron/intelligence] Capacity Oracle failed', { orgId: org.id, error: msg })
      }

      results.push({
        orgId: org.id,
        revenueRadar: revenueCount,
        clientHealth: healthCount,
        cashFlow: cashFlowOk,
        capacity: capacityStatus,
        errors,
      })
    }

    return {
      message: `Intelligence: ${totalOpportunities} opportunities, ${totalClientsScored} clients scored, ${totalAlerts} alerts across ${(orgs ?? []).length} orgs`,
      details: {
        orgs: (orgs ?? []).length,
        totalOpportunities,
        totalClientsScored,
        totalAlerts,
        results,
      },
    }
  })
}
