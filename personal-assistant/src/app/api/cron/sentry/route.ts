import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runSentryTick } from '@/lib/agent/sentry'
import { processSentryEscalations } from '@/lib/agent/sentry-escalation'

export const maxDuration = 300 // allow up to 5 minutes for sentry checks
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
            console.error('[cron/sentry] Failed to initialize Supabase client')
            return new NextResponse('Internal Server Error', { status: 500 })
        }

        // 1. Get all active organizations
        const { data: orgs, error: orgError } = await supabase
            .from('organizations')
            .select('id')

        if (orgError) {
            console.error('[cron/sentry] Failed to fetch organizations', orgError)
            return new NextResponse('Database Error', { status: 500 })
        }

        if (!orgs || orgs.length === 0) {
            return NextResponse.json({ success: true, message: 'No organizations to process', results: [] })
        }

        const results: Record<string, unknown>[] = []

        // 2. Process sentry for each org
        for (const org of orgs) {
            const orgId = org.id

            try {
                // Get sentry agent config for this org
                const { data: config, error: configError } = await supabase
                    .from('agent_configs')
                    .select('id')
                    .eq('org_id', orgId)
                    .eq('agent_type', 'sentry')
                    .eq('enabled', true)
                    .single()

                if (configError || !config) {
                    console.warn(`[cron/sentry] No enabled sentry config for org ${orgId}`)
                    continue
                }

                // Run sentry tick
                const sentryResult = await runSentryTick(supabase, orgId, config.id)

                // Process escalations
                const escalationResult = await processSentryEscalations(supabase, orgId)

                const summary = `sentry processed=${sentryResult.processed} triggered=${sentryResult.triggered} alerts=${sentryResult.alertsCreated} escalated=${escalationResult.escalated} failed=${escalationResult.failed}`
                console.log(`[cron/sentry] org=${orgId}: ${summary}`)

                // Log to activity feed
                await supabase
                    .from('activity_feed')
                    .insert({
                        org_id: orgId,
                        action_type: 'system',
                        action: 'sentry_tick',
                        result: summary,
                    })
                    .then(({ error: logErr }) => {
                        if (logErr) console.error(`[cron/sentry] Failed to log activity for org ${orgId}:`, logErr.message)
                    })

                results.push({
                    orgId,
                    sentry: sentryResult,
                    escalation: escalationResult,
                })
            } catch (orgErr) {
                console.error(`[cron/sentry] Failed processing sentry for org ${orgId}:`, orgErr)
                results.push({
                    orgId,
                    error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
                })
            }
        }

        return NextResponse.json({ success: true, message: 'Sentry processing complete', results })
    } catch (err) {
        console.error('[cron/sentry] Fatal error:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
