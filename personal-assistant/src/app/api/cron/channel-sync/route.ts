import { withCronGuard, cronMaxDuration, cronDynamic } from '@/lib/cron/cron-guard'
import { getAllAdapters } from '@/lib/channels/index'
import { routeMessages } from '@/lib/agent/action-router'

export const maxDuration = cronMaxDuration
export const dynamic = cronDynamic

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const adapters = getAllAdapters()
    let totalMessages = 0

    for (const org of orgs ?? []) {
      const orgId = org.id

      for (const adapter of adapters) {
        const { data: connection } = await supabase
          .from('channel_connections')
          .select('*')
          .eq('org_id', orgId)
          .eq('channel_type', adapter.type)
          .eq('status', 'connected')
          .single()

        if (!connection) continue

        const lastSync = connection.last_sync
          ? new Date(connection.last_sync)
          : new Date(Date.now() - 24 * 60 * 60 * 1000)

        try {
          const newMessages = await adapter.pull(connection.config as any, lastSync)

          if (newMessages.length > 0) {
            const routedMessages = await routeMessages(supabase, newMessages, orgId)
            totalMessages += routedMessages.length

            console.log(
              `[cron/channel-sync] org=${orgId} channel=${adapter.type}: ${routedMessages.length} messages`,
            )

            await supabase
              .from('channel_connections')
              .update({
                last_sync: new Date().toISOString(),
                message_count: connection.message_count + routedMessages.length,
                updated_at: new Date().toISOString(),
              })
              .eq('id', connection.id)

            await supabase.from('activity_feed').insert({
              org_id: orgId,
              action_type: 'system',
              action: 'channel_sync',
              result: `Processed ${routedMessages.length} messages from ${adapter.type}`,
            })
          }
        } catch (adapterErr) {
          console.error(
            `[cron/channel-sync] Failed pulling adapter ${adapter.type} for org ${orgId}:`,
            adapterErr,
          )
        }
      }
    }

    return {
      message: `Sync complete, ${totalMessages} messages processed`,
      details: { orgsProcessed: orgs?.length ?? 0, totalMessages },
    }
  })
}
