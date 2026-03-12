import { withCronGuard } from '@/lib/cron/cron-guard'
import { ThreadArchiver } from '@/lib/memory/thread-archiver'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const archiver = new ThreadArchiver(supabase)
    const results = await archiver.archiveStaleThreads(10)

    return {
      message: `Archived ${results.length} stale threads`,
      details: {
        archived: results.length,
        threads: results.map(r => ({
          threadId: r.threadId,
          turnCount: r.turnCount,
          summaryTokens: r.summaryTokens,
          entityCount: r.entityIds.length,
        })),
      },
    }
  })
}
