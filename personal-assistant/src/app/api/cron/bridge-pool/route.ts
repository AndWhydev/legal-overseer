import { withCronGuard } from '@/lib/cron/cron-guard'
import { VpsPool } from '@/lib/bridges/vps-pool'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const pool = new VpsPool(supabase)
    const deficit = await pool.getDeficit()

    if (deficit === 0) {
      return { message: 'Pool is full', poolSize: await pool.getPoolCount() }
    }

    console.warn(`[cron/bridge-pool] Pool deficit: ${deficit} instances needed`)

    return {
      message: `Pool deficit: ${deficit} instances needed. Manual provisioning required.`,
      deficit,
      currentPoolSize: await pool.getPoolCount(),
    }
  })
}
