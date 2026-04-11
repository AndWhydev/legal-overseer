/**
 * Backfill contextual embeddings for existing channel_messages.
 * Queues messages for re-embedding via the existing embedding_jobs pipeline.
 * The contextualizer (37-01) will enrich chunks during re-processing.
 *
 * Usage:
 *   npx tsx scripts/backfill-contextual-embeddings.ts --limit 100
 *   npx tsx scripts/backfill-contextual-embeddings.ts --dry-run
 *   npx tsx scripts/backfill-contextual-embeddings.ts --channel gmail --limit 200
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500
const channelIdx = args.indexOf('--channel')
const channelFilter = channelIdx >= 0 ? args[channelIdx + 1] : null

async function main() {
  console.log(`Backfill contextual embeddings (limit: ${limit}, dry-run: ${dryRun}${channelFilter ? `, channel: ${channelFilter}` : ''})`)

  // Fetch messages that have content worth embedding
  let query = supabase
    .from('channel_messages')
    .select('id, org_id, external_id, sender, sender_email, channel, subject, body, body_full, received_at')
    .or('body.neq.,body_full.not.is.null')
    .order('received_at', { ascending: false })
    .limit(limit)

  if (channelFilter) {
    query = query.eq('channel', channelFilter)
  }

  const { data: messages, error } = await query

  if (error) {
    console.error('Failed to fetch messages:', error.message)
    process.exit(1)
  }

  if (!messages || messages.length === 0) {
    console.log('No messages to backfill.')
    return
  }

  console.log(`Found ${messages.length} messages to consider`)

  if (dryRun) {
    console.log('\nDRY RUN — would queue these messages:')
    messages.slice(0, 15).forEach(m => {
      const bodyLen = (m.body_full || m.body || '').length
      console.log(`  ${m.external_id} | ${m.sender} | ${m.channel} | ${m.received_at} | ${bodyLen} chars`)
    })
    if (messages.length > 15) console.log(`  ... and ${messages.length - 15} more`)
    return
  }

  // Check for existing pending/processing jobs to avoid duplicates
  const externalIds = messages.map(m => m.external_id)
  const { data: existingJobs } = await supabase
    .from('embedding_jobs')
    .select('message_id')
    .in('message_id', externalIds)
    .in('status', ['pending', 'processing'])

  const existingIds = new Set((existingJobs || []).map(j => j.message_id))
  const toQueue = messages.filter(m => !existingIds.has(m.external_id))

  console.log(`${existingIds.size} already queued, ${toQueue.length} new to queue`)

  // Queue in batches of 50 via upsert (matches enqueueEmbedding pattern)
  let queued = 0
  for (let i = 0; i < toQueue.length; i += 50) {
    const batch = toQueue.slice(i, i + 50)
    const jobs = batch.map(m => {
      const content = m.body_full || m.body || ''
      return {
        org_id: m.org_id,
        message_id: m.external_id,
        content,
        metadata: {
          message_id: m.external_id,
          org_id: m.org_id,
          channel: m.channel,
          sender: m.sender,
          sender_email: m.sender_email,
          subject: m.subject,
          received_at: m.received_at,
          chunk_index: 0,
          total_chunks: 1,
          is_full_body: true,
          recontextualize: true,
        },
        status: 'pending' as const,
        retry_count: 0,
      }
    })

    const { error: insertError } = await supabase
      .from('embedding_jobs')
      .upsert(jobs, { onConflict: 'org_id,message_id' })

    if (insertError) {
      console.error(`Batch ${Math.floor(i / 50) + 1} failed:`, insertError.message)
      continue
    }
    queued += batch.length
    console.log(`Queued batch ${Math.floor(i / 50) + 1}: ${batch.length} jobs (${queued}/${toQueue.length} total)`)
  }

  console.log(`\nDone. Queued ${queued} messages for re-embedding with contextual enrichment.`)
  console.log('The process-embeddings cron will pick these up automatically.')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
