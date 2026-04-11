import { withCronGuard } from '@/lib/cron/cron-guard'
import { processEmbeddingQueue, clearStaleJobs } from '@/lib/rag/embedding-queue'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Clear any jobs stuck in 'processing' for over 1 hour
    const { clearedCount } = await clearStaleJobs(supabase)

    // Process pending embedding jobs in batches
    const result = await processEmbeddingQueue(supabase, 20)

    return {
      message: `Embeddings: ${result.completed} completed, ${result.failed} failed, ${clearedCount} stale recovered`,
      details: {
        processed: result.processed,
        completed: result.completed,
        failed: result.failed,
        staleRecovered: clearedCount,
        errors: result.errors.slice(0, 5),
      },
    }
  })
}
