/**
 * Backfill script: processes all pending embedding jobs in batches.
 * Run with: npx tsx scripts/backfill-embeddings.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { processEmbeddingQueue } from '../src/lib/rag/embedding-queue'

const BATCH_SIZE = 10
const MAX_ITERATIONS = 200 // safety limit: 200 * 10 = 2000 jobs max

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('Starting embedding backfill...')

  let totalProcessed = 0
  let totalCompleted = 0
  let totalFailed = 0
  let iteration = 0

  while (iteration < MAX_ITERATIONS) {
    iteration++
    const result = await processEmbeddingQueue(supabase, BATCH_SIZE)

    if (result.processed === 0) {
      console.log('No more pending jobs. Backfill complete.')
      break
    }

    totalProcessed += result.processed
    totalCompleted += result.completed
    totalFailed += result.failed

    console.log(`Batch ${iteration}: ${result.processed} processed (${result.completed} ok, ${result.failed} failed) | Total: ${totalProcessed} processed, ${totalCompleted} completed, ${totalFailed} failed`)

    if (result.errors.length > 0) {
      console.log('  Errors:', result.errors.join('; '))
    }

    // Brief pause between batches to avoid rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nBackfill finished: ${totalProcessed} processed, ${totalCompleted} completed, ${totalFailed} failed in ${iteration} iterations`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
