import { withCronGuard } from '@/lib/cron/cron-guard'
import { VpsPool, createImessageProvisioner, isImessageVpsConfigured } from '@/lib/bridges'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * /api/cron/bridge-pool — runs every 15 minutes (vercel.json).
 *
 * Keeps the iMessage Mac VPS pool topped up to TARGET_POOL_SIZE so new
 * user connections never have to wait for a cold boot (~3-5min).
 *
 * When IMESSAGE_VPS_* env vars are missing, the cron degrades to a
 * no-op that only reports deficit — useful in preview deploys and
 * during bringup when credentials aren't configured yet.
 */
export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const pool = new VpsPool(supabase)
    const [poolSize, deficit] = await Promise.all([
      pool.getPoolCount(),
      pool.getDeficit(),
    ])

    if (deficit === 0) {
      return { message: 'Pool is full', details: { poolSize } }
    }

    if (!isImessageVpsConfigured()) {
      return {
        message: `Pool deficit: ${deficit} — IMESSAGE_VPS_* env vars not configured, skipping replenish`,
        details: { poolSize, deficit, skipped: true },
      }
    }

    const provisioner = createImessageProvisioner(supabase)
    const result = await provisioner.replenishPool()

    const newPoolSize = await pool.getPoolCount()
    return {
      message: `Replenished pool: +${result.provisioned} warm, ${result.failed} failed`,
      details: {
        poolSizeBefore: poolSize,
        poolSizeAfter: newPoolSize,
        requested: result.requested,
        provisioned: result.provisioned,
        failed: result.failed,
        errors: result.errors,
      },
    }
  })
}
