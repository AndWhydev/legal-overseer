import { withCronGuard } from '@/lib/cron/cron-guard'
import { pollChannel, type PollResult } from '@/lib/channels/relay-daemon'
import { enqueueEmbedding } from '@/lib/rag/embedding-queue'
import { enrichMessage } from '@/lib/intelligence/ingest-enrichment'
import type { ChannelType } from '@/lib/channels/types'
import { logger } from '@/lib/core/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organisations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organisations: ${orgError.message}`)
    }

    let totalMessages = 0
    let totalInserted = 0
    const channelResults: { orgId: string; channel: string; result: PollResult }[] = []

    for (const org of orgs ?? []) {
      const orgId = org.id

      // Query relay-enabled connected channels for this org
      const { data: connections } = await supabase
        .from('channel_connections')
        .select('channel_type')
        .eq('org_id', orgId)
        .eq('status', 'connected')
        .eq('relay_enabled', true)

      if (!connections || connections.length === 0) continue

      for (const conn of connections) {
        const channelType = conn.channel_type as ChannelType
        const result = await pollChannel(supabase, orgId, channelType)

        channelResults.push({ orgId, channel: channelType, result })
        totalMessages += result.messagesFound
        totalInserted += result.messagesInserted

        if (result.messagesInserted > 0) {
          logger.info(
            `[cron/channel-sync] org=${orgId} channel=${channelType}: ${result.messagesInserted} inserted (${result.messagesFound} found)`,
          )

          await supabase.from('activity_feed').insert({
            org_id: orgId,
            action_type: 'system',
            action: 'channel_sync',
            result: `Processed ${result.messagesInserted} messages from ${channelType}`,
          })

          // Enqueue newly inserted messages for RAG embedding
          // Note: messages may have been re-routed to a different org by the relay daemon's
          // sender→contact resolution. Query recent messages across all orgs for this channel.
          const { data: newMsgs } = await supabase
            .from('channel_messages')
            .select('id, org_id, body, sender, sender_email, subject, received_at')
            .eq('channel', channelType)
            .order('received_at', { ascending: false })
            .limit(result.messagesInserted)

          for (const msg of newMsgs ?? []) {
            const msgOrgId = (msg as Record<string, unknown>).org_id as string || orgId
            const content = [msg.subject, msg.body].filter(Boolean).join('\n\n')
            if (content.length > 10) {
              enqueueEmbedding(supabase, msgOrgId, msg.id, content, {
                message_id: msg.id,
                org_id: msgOrgId,
                channel: channelType,
                sender: msg.sender ?? 'unknown',
                sender_email: msg.sender_email ?? undefined,
                subject: msg.subject ?? undefined,
                received_at: msg.received_at ?? new Date().toISOString(),
                chunk_index: 0,
                total_chunks: 1,
                is_full_body: true,
              }).catch((err) => {
                logger.warn('[cron/channel-sync] Embedding enqueue failed', {
                  messageId: msg.id,
                  error: err instanceof Error ? err.message : String(err),
                })
              })
            }

            // Fire-and-forget ingest-time enrichment (summary, urgency, entities, actions, category)
            enrichMessage(supabase, orgId, {
              id: msg.id,
              org_id: orgId,
              channel: channelType,
              sender: msg.sender ?? 'unknown',
              sender_email: msg.sender_email ?? null,
              subject: msg.subject ?? null,
              body: msg.body ?? '',
              received_at: msg.received_at ?? new Date().toISOString(),
            }).catch((err) => {
              logger.warn('[cron/channel-sync] Ingest enrichment failed', {
                messageId: msg.id,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }
        }

        if (result.error) {
          logger.error(
            `[cron/channel-sync] org=${orgId} channel=${channelType} error: ${result.error}`,
          )
        }
      }
    }

    return {
      message: `Sync complete, ${totalInserted} messages inserted (${totalMessages} found)`,
      details: { orgsProcessed: orgs?.length ?? 0, totalMessages, totalInserted },
    }
  })
}
