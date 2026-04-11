import { withCronGuard } from '@/lib/cron/cron-guard'
import { refreshAllTokens } from '@/lib/channels/token-refresh'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const { results } = await refreshAllTokens(supabase)

    const refreshedCount = results.filter(r => r.refreshed).length
    const errorCount = results.filter(r => r.error).length

    return {
      message: `Token refresh complete: ${refreshedCount} refreshed, ${errorCount} errors, ${results.length} checked`,
      details: {
        total: results.length,
        refreshed: refreshedCount,
        errors: errorCount,
        results,
      },
    }
  })
}
