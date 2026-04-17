import { withCronGuard } from '@/lib/cron/cron-guard'
import { createFlyClient } from '@/lib/bridges'
import { logger } from '@/lib/core/logger'
import * as Sentry from '@sentry/nextjs'

// Pool org uses a sentinel org_id — see src/lib/bridges/vps-pool.ts
const MAC_VPS_POOL_ORG_ID = '__bitbit_pool__'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/bridge-cost-leak — daily leak detector.
 *
 * Each iMessage / WhatsApp / Android-Messages bridge is backed by a Fly
 * Machine (wa/android) or a claimed Mac VPS (imessage). If a user signs up,
 * starts provisioning, then skips / closes the tab / fails mid-flow, the
 * Fly Machine can stay running and the Mac VPS can stay claimed. These cost
 * $1.90–$7.70/mo each — at scale, orphans are the dominant cost risk.
 *
 * This cron compares:
 *   (# Fly Machines on bitbit-bridges)   vs   (# provisioning/connected rows)
 *   (# claimed Mac VPS instances)        vs   (# connected iMessage rows)
 *
 * If machines > connections * TOLERANCE (default 1.2×), we fire a Sentry
 * alert with the candidate machine IDs. Orphans get cleaned up manually for
 * now; automated destruction is a follow-up once we've built confidence in
 * the heuristic.
 */

const ORPHAN_TOLERANCE = 1.2

interface OrphanReport {
  flyMachineCount: number
  flyConnectionCount: number
  flyLeakFactor: number
  macVpsClaimedCount: number
  macImessageConnectedCount: number
  macLeakFactor: number
  orphanCandidates: {
    flyMachineIds: string[]
    macVpsIds: string[]
  }
}

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const report: OrphanReport = {
      flyMachineCount: 0,
      flyConnectionCount: 0,
      flyLeakFactor: 1,
      macVpsClaimedCount: 0,
      macImessageConnectedCount: 0,
      macLeakFactor: 1,
      orphanCandidates: { flyMachineIds: [], macVpsIds: [] },
    }

    // ─── Fly Machines vs. whatsapp/android connections ──────────────────
    try {
      const fly = createFlyClient()
      const machines = await fly.listMachines()
      const liveStates = new Set(['created', 'starting', 'started', 'stopping', 'stopped'])
      const aliveMachines = machines.filter(m => liveStates.has(m.state))
      report.flyMachineCount = aliveMachines.length

      const { count: connectedCount } = await supabase
        .from('org_connections')
        .select('id', { count: 'exact', head: true })
        .in('provider', ['whatsapp', 'android-messages'])
        .in('status', ['provisioning', 'linking', 'connected'])
      report.flyConnectionCount = connectedCount ?? 0

      report.flyLeakFactor =
        report.flyConnectionCount === 0
          ? report.flyMachineCount
          : report.flyMachineCount / report.flyConnectionCount

      if (report.flyLeakFactor > ORPHAN_TOLERANCE) {
        // Cross-reference fly_machine_id on connections to identify orphans.
        const { data: connRows } = await supabase
          .from('org_connections')
          .select('config')
          .in('provider', ['whatsapp', 'android-messages'])
          .in('status', ['provisioning', 'linking', 'connected'])

        const trackedIds = new Set(
          (connRows ?? [])
            .map(r => (r.config as Record<string, unknown>)?.fly_machine_id as string | undefined)
            .filter(Boolean) as string[],
        )
        report.orphanCandidates.flyMachineIds = aliveMachines
          .map(m => m.id)
          .filter(id => !trackedIds.has(id))
      }
    } catch (err) {
      logger.error('[bridge-cost-leak] Fly machine scan failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // ─── Claimed Mac VPS vs. connected iMessage connections ─────────────
    // Pool stored in org_connections with org_id=__bitbit_pool__:
    //   status='pending'   → warm / available
    //   status='disabled'  → claimed (see VpsPool.claimInstance)
    try {
      const { count: claimedCount } = await supabase
        .from('org_connections')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', MAC_VPS_POOL_ORG_ID)
        .eq('provider', 'imessage')
        .eq('status', 'disabled')
      report.macVpsClaimedCount = claimedCount ?? 0

      const { count: imessageCount } = await supabase
        .from('org_connections')
        .select('id', { count: 'exact', head: true })
        .neq('org_id', MAC_VPS_POOL_ORG_ID)
        .eq('provider', 'imessage')
        .in('status', ['provisioning', 'linking', 'connected'])
      report.macImessageConnectedCount = imessageCount ?? 0

      report.macLeakFactor =
        report.macImessageConnectedCount === 0
          ? report.macVpsClaimedCount
          : report.macVpsClaimedCount / report.macImessageConnectedCount

      if (report.macLeakFactor > ORPHAN_TOLERANCE) {
        // Identify claimed pool instances whose `claimed_by` connection_id is
        // not a live iMessage connection → those are the orphan candidates.
        const { data: claimedRows } = await supabase
          .from('org_connections')
          .select('id, config')
          .eq('org_id', MAC_VPS_POOL_ORG_ID)
          .eq('provider', 'imessage')
          .eq('status', 'disabled')

        const { data: liveConns } = await supabase
          .from('org_connections')
          .select('id')
          .neq('org_id', MAC_VPS_POOL_ORG_ID)
          .eq('provider', 'imessage')
          .in('status', ['provisioning', 'linking', 'connected'])

        const liveIds = new Set((liveConns ?? []).map(r => r.id as string))

        report.orphanCandidates.macVpsIds = (claimedRows ?? [])
          .filter(r => {
            const claimedBy = (r.config as Record<string, unknown>)?.claimed_by as string | undefined
            return !claimedBy || !liveIds.has(claimedBy)
          })
          .map(r => ((r.config as Record<string, unknown>)?.vps_id as string) ?? (r.id as string))
      }
    } catch (err) {
      logger.error('[bridge-cost-leak] Mac VPS scan failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // ─── Alert when leak detected ──────────────────────────────────────
    const isLeaking = report.flyLeakFactor > ORPHAN_TOLERANCE || report.macLeakFactor > ORPHAN_TOLERANCE
    if (isLeaking) {
      logger.warn('[bridge-cost-leak] Orphan infra detected', report as unknown as Record<string, unknown>)
      Sentry.captureMessage('Bridge infrastructure cost leak detected', {
        level: 'warning',
        extra: report as unknown as Record<string, unknown>,
      })
    }

    return {
      message: isLeaking ? 'Orphans detected — see Sentry for IDs' : 'No orphans detected',
      report,
    }
  })
}
