import { withCronGuard } from '@/lib/cron/cron-guard'
import { pollChannel, type PollResult } from '@/lib/channels/relay-daemon'
import type { ChannelType } from '@/lib/channels/types'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
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
