import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllAdapters } from '@/lib/channels/index'
import { routeMessages } from '@/lib/agent/action-router'
import { writeTaskEvent } from '@/lib/context/timeline-writer'

export const maxDuration = 300 // allow up to 5 minutes for polling & classification
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // Validate cron secret if deployed
    if (
        process.env.CRON_SECRET &&
        request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const supabase = await createClient()
        if (!supabase) {
            console.error('[cron/channel-sync] Failed to initialize Supabase client')
            return new NextResponse('Internal Server Error', { status: 500 })
        }

        // 1. Get all active organizations
        const { data: orgs, error: orgError } = await supabase
            .from('organizations')
            .select('id')

        if (orgError) {
            console.error('[cron/channel-sync] Failed to fetch organizations', orgError)
            return new NextResponse('Database Error', { status: 500 })
        }

        const adapters = getAllAdapters()

        for (const org of orgs) {
            const orgId = org.id

            for (const adapter of adapters) {
                // Check if the channel is enabled for this org
                const { data: connection } = await supabase
                    .from('channel_connections')
                    .select('*')
                    .eq('org_id', orgId)
                    .eq('channel_type', adapter.type)
                    .eq('status', 'connected')
                    .single()

                if (!connection) continue

                // Determine how far back to poll
                const lastSync = connection.last_sync ? new Date(connection.last_sync) : new Date(Date.now() - 24 * 60 * 60 * 1000)

                try {
                    // Poll the adapter
                    const newMessages = await adapter.pull(connection.config as any, lastSync)

                    if (newMessages.length > 0) {
                        // Classify and Route messages
                        const routedMessages = await routeMessages(supabase, newMessages, orgId)

                        // Generate summary for logging
                        const summary = `Processed ${routedMessages.length} messages from ${adapter.type}`
                        console.log(`[cron/channel-sync] org=${orgId} channel=${adapter.type}: ${summary}`)

                        // Mark connection as synced
                        await supabase
                            .from('channel_connections')
                            .update({
                                last_sync: new Date().toISOString(),
                                message_count: connection.message_count + routedMessages.length,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', connection.id)

                        // Optionally: create activity feed entry
                        await supabase
                            .from('activity_feed')
                            .insert({
                                org_id: orgId,
                                action_type: 'system',
                                action: 'channel_sync',
                                result: summary
                            })
                    }
                } catch (adapterErr) {
                    console.error(`[cron/channel-sync] Failed pulling adapter ${adapter.type} for org ${orgId}:`, adapterErr)
                }
            }
        }

        return NextResponse.json({ success: true, message: 'Sync complete' })
    } catch (err) {
        console.error('[cron/channel-sync] Fatal error:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
